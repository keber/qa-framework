# Proposal: JMeter on Azure Load Testing as the primary load track

Status: direction decided by Keber (recorded 2026-11-18). Nothing in this
document ships in the package and nothing here has been built. No Azure resource
was created and no Azure or ADO API was called while writing it. Facts were
checked on 2026-11-17 unless marked 2026-11-12 (first research round, WP3.2).

## Decision

**The framework's load track targets Azure Load Testing (ALT) run from Azure
DevOps, with Apache JMeter as the engine.** The goal is load and performance
testing in the team's own CI while ALT monitors the Azure infrastructure under
test (server-side metrics). k6 was the first approach, but ALT cannot run k6.
The team already loads JMeter tests into ALT, with limited JMeter expertise, so
the framework's value is everything around the `.jmx`: the ALT YAML test config,
fail criteria, `appComponents`, the `AzureLoadTest@1` pipeline, and conventions
for env parameters, CSV data and Key Vault secrets. The `.jmx` itself is a stable
template; what varies is injected from the YAML, so PR review is about YAML and
data, not regenerated XML. The existing k6 track stays as it is, **frozen** (no
new features), until usage data decides whether to keep or deprecate it.

Why this and not the alternatives:

- **k6 in ALT**: not supported, no roadmap item found ([S1], [S2]).
- **Locust**: GA in ALT, but nobody on the team knows it. Rejected for now;
  reconsider only if the team adopts Python-based tests.
- **JMeter**: GA in ALT, already used by the team, and also runs locally from the
  CLI, which removes most of what k6 uniquely offered (section 4).

## 1. What the framework will provide

Target shape, to be confirmed by the spike (section 8). Paths are proposals.

| Piece | Content | Who edits it |
|---|---|---|
| `.jmx` template | Fixed structure: login, flows, extractors, assertions. Host, users, ramp, duration, data file and secret names come from properties/env, never literals. | Framework (rarely); not regenerated per test |
| ALT YAML (`testType: JMX`) | `testId`, `testPlan`, `engineInstances`, `env`, `secrets`, `configurationFiles`, `splitAllCSVs`, `failureCriteria`, `autoStop`, `appComponents`, `referenceIdentities` | Project, reviewed in PR |
| CSV data | Users, ids, payloads per row; split across engines with `splitAllCSVs: True` | Project, reviewed in PR |
| Pipeline template | Validate config -> `AzureLoadTest@1` -> publish results as a pipeline artifact | Framework template, project parameters |
| Skill | How to fill the YAML, pick criteria and app components, read results, for a team with limited JMeter expertise | Framework |

Conventions to define in the skill:

- **Env parameters**: one name per varying value (for example `host`,
  `threads`, `rampUpSeconds`, `durationSeconds`), read in the `.jmx` through the
  documented ALT mechanism ([S3]). No value is hard-coded in the `.jmx`.
- **Users**: total virtual users = threads per engine x `engineInstances`. ALT
  multiplies per engine; the skill must say this next to every example.
- **CSV**: header row, one file per data set, `splitAllCSVs` so engines do not
  reuse the same rows. No credential in a CSV.
- **Secrets**: only Key Vault secret URIs in the YAML (section 6).
- **Fail criteria**: client metrics (`p95(response_time_ms)`,
  `percentage(error)`, `avg(requests_per_sec)`) per sampler name, plus server
  metrics from Azure Monitor for the components in `appComponents`. Up to 50
  criteria per test ([S2]). Exact syntax is a spike item (section 8).
- **Naming**: sampler names are the criteria keys, so they are stable,
  lowercase identifiers, the same role `tag` has in the k6 plan.

Illustrative YAML, **not validated against ALT** (the reference shows two
fail-criteria forms; see section 8):

```yaml
version: v0.1
testId: orders-list-load
testType: JMX
testPlan: orders.jmx
engineInstances: 1
configurationFiles:
  - users.csv
splitAllCSVs: True
env:
  - name: host
    value: your-app.qa.example.com
  - name: threads
    value: 5
secrets:
  - name: qaPerfPassword
    value: https://<vault>.vault.azure.net/secrets/qa-perf-password
failureCriteria:
  - p95(response_time_ms) > 3000
  - orders_list: percentage(error) > 0
autoStop:
  errorPercentage: 50
  timeWindow: 60
```

## 2. The pipeline

- Task: `AzureLoadTest@1` with `azureSubscription`, `loadTestConfigFile`,
  `resourceGroup`, `loadTestResource`; optional `secrets`, `env`,
  `overrideParameters`, `outputVariableName` ([S7], [S8]).
- The task comes from a **Marketplace extension**: an Azure DevOps organization
  admin must install it before any pipeline can use it.
- The task **fails when a fail criterion fails**, so the pipeline result is the
  verdict. A publish step keeps the results as a pipeline artifact.
- Before the task, a framework check step validates the YAML against the
  write-safety policy (section 5). It runs on the agent, so it holds even when the
  YAML was edited by hand.

## 3. Mapping from the k6 plan

For reference when moving a k6 plan to the JMeter track, or if both engines are
kept (section 4).

| k6 plan (`plan.json`) | JMeter + ALT | Note |
|---|---|---|
| `exitCriteria.p95Ms`, `p99Ms` | `p95(response_time_ms) > X`, `p99(...)` | Global or per sampler. |
| `exitCriteria.perEndpoint` | `<sampler>: p95(response_time_ms) > X` | Sampler name = plan `tag`. |
| Implicit zero failed calls | `<sampler>: percentage(error) > 0` | ALT `error` supports only `>` ([S2]). |
| `minThroughputRps` | `avg(requests_per_sec) < X` | ALT average, not the k6 rate. |
| `load.stages`, `vus`, `duration` | Thread group threads, ramp-up, duration via env | Per engine; multiplied by `engineInstances`. |
| `expect.status`, `jsonField` | Response Assertion, JSON Extractor / JSON Assertion | Part of the template. |
| `auth.sessions` | Key Vault secret, login step in the template | Section 6. |
| `serverMonitoring` (free text) | `appComponents` + server-metric fail criteria | A gain: monitoring becomes part of the verdict. |
| `comparison.pairs` | None | ALT compares whole runs in the portal. |

## 4. Generating k6 and JMeter from one `plan.json` (analysis)

- **For**: one reviewed source, no drift between engines as long as nobody
  hand-edits outputs. The real risk is a `.jmx` edited in the JMeter GUI.
- **Cost**: every new plan feature must be implemented twice, and the semantics
  differ: k6 executors and thresholds vs JMeter thread groups and ALT fail
  criteria, and ALT multiplies users per engine.
- **k6's unique value is small**: JMeter also runs locally through its CLI. What
  remains is fast local runs without ALT cost. ALT bills per virtual user hour
  (VUH) with a minimum of 10 VUs x 10 minutes per engine per run from 2026-03-01
  ([S11]).

**Recommendation**: JMeter primary. k6 kept as it is, frozen, until usage data
decides keep or deprecate. If both are kept: `plan.json` is the single source,
generated files carry a do-not-edit header, and the framework's test suite gets a
parity test (same endpoints, weights and thresholds in both outputs). Until then
the JMeter track's reviewed artifacts are the YAML and the CSV data.

## 5. Write-safety policy in a cloud run (key risk)

Locally `perf-guard.js` sits in the only path to k6. In ALT there are several
paths to a run: portal, `az load`, the pipeline task and the REST API. Any of
them can upload a different `.jmx` or edit the YAML without a guard seeing it,
so controls must hold even when someone bypasses the template.

| Policy rule | Cloud enforcement (layered) |
|---|---|
| Sec 7: target host = host of `project.qaBaseUrl`, never prod | 1) pipeline check on the YAML `host` env; 2) template has no literal URL (check the `.jmx` for literal hosts); 3) **network**: VNet injection into a subnet whose NSG allows outbound only to the QA host. Only 3 survives a bypass. |
| Sec 2 gate 1: write opt-in | Pipeline parameter defaulting to false plus an environment approval check. |
| Sec 2 gate 2: `writeCatalogId` | Presence check in the pipeline step. |
| Sec 6: write = 1 user, 1 iteration unless `concurrentWrite` | Pipeline check on threads, iterations and `engineInstances: 1`. |
| Sec 6: concurrent write caps, `approvedOn` = run date | Check runs on the agent on the run date; the approval records who approved. |
| Runaway load | `autoStop` with a low `errorPercentage`; monthly VUH limit on the resource ([S12]). |

The check step should reuse the rule logic of `perf-guard.js`, not a second copy
of the policy.

## 6. Security and secrets

- **Pipeline identity**: workload identity federation service connection scoped
  to the resource group, holding **Load Test Contributor** only. People get
  **Load Test Reader**. Roles confirmed: Load Test Reader, Contributor, Owner;
  subscription Owner and Contributor inherit Load Test Owner ([S15]).
- **Managed identity**: anyone who can run tests can use the resource's managed
  identity during a run ([S14]). This is the second reason to keep run permission
  on the pipeline identity only.
- **`referenceIdentities`** kinds: `KeyVault`, `Metrics`, `Engine` ([S2]). The
  managed-identity page still mentions Key Vault only ([S14]): Microsoft's docs
  disagree, to settle in the spike.
- **Metrics identity**: needs read access to the monitored resources. Monitoring
  Reader is our **inference**, not a documented requirement.
- **Key Vault**: the YAML holds secret URIs only; ALT fetches values per run
  ([S3]). Whether Key Vault RBAC works as well as access policies is **not
  verified**.
- **Sessions**: short-lived tokens cannot sit in Key Vault without a refresh, so
  the template logs in with a service account whose password is in Key Vault.
  That is a reusable credential and needs the write approver's sign-off.
- **Data residency**: test data and results stay in the resource's region.
- **Residual risk**: a subscription Owner or Contributor can change RBAC, the
  NSG or the YAML. The design limits accidents and casual bypass, not a determined
  administrator; the same trust level as a developer editing `perf-guard.js`.
- Nothing puts a credential in a plan, a YAML, a CSV or the repo. Vault URIs are
  not secret but reveal vault names; keep the YAML in the project's QA folder.

## 7. ALT facts (2026-11-17)

| Topic | Finding | Source |
|---|---|---|
| Engines | JMeter GA, Locust GA (March 2025, Azure Updates AZ483803, seen via an aggregator), URL tests GA. k6 not supported, no roadmap item. "Currently does not support other testing frameworks than Apache JMeter and Locust" (overview updated 2026-06-11). | [S1] |
| `testType` | `URL`, `JMX`, `Locust` (reference updated 2026-10-28). | [S2] |
| YAML keys | `version: v0.1`, `testId`, `testType`, `testPlan`, `engineInstances`, `description`, `configurationFiles`, `zipArtifacts`, `properties.userPropertyFile`, `splitAllCSVs`, `env`, `secrets`, `certificates`, `referenceIdentities`, `keyVaultReferenceIdentity`, `failureCriteria`, `autoStop`, `subnetId`, `publicIPDisabled`, `appComponents`, `regionalLoadTestConfig` (2026-11-12). | [S2] |
| Fail criteria | Up to 50. Client metrics `response_time_ms`, `latency`, `error`, `requests_per_sec`, `requests`; server metrics from Azure Monitor. Request names must match the JMeter sampler name. | [S2], [S3b] |
| Auto-stop | YAML `autoStop: disable` or `{ errorPercentage, timeWindow }` (defaults 90 %, 60 s). The in-script auto-stop listener is JMeter-only. | [S2] |
| Server metrics | About 40 Azure resource types, including App Service, AKS, Azure SQL, Cosmos DB, Functions, Container Apps, APIM, Front Door, Service Bus, VMs. | https://learn.microsoft.com/en-us/azure/app-testing/load-testing/resource-supported-azure-resource-types |
| Multi-region load | GA (May 2024). | https://techcommunity.microsoft.com/blog/appsonazureblog/announcing-multi-region-load-tests-and-support-for-locust-framework-in-azure-loa/4145411 |
| VNet injection | GA. Same subscription and region, no IPv6, Network Contributor on the VNet. Deploys public IP, NSG and load balancer per run unless `publicIPDisabled`. Egress needed to `*.windows.net`, `*.blob.storage.azure.net`, `*.azurecr.io`. | [S13] |
| Limits | Up to 400 engines per run; duration 3 h by default, 24 h hard cap; 5 to 50 concurrent runs; retention: server metrics 90 days, client metrics 365 days, results and logs 6 months. | [S16] |
| Pricing | Per VUH; minimum 10 VUs x 10 min per engine from 2026-03-01. Unit prices are placeholders on the official page; secondary sources quoted USD 0.15 and 0.06 per VUH on 2026-11-12 (unconfirmed). | [S11] |
| Spend control | Monthly VUH limit per resource, best effort; new runs refused and running tests stopped when reached (2026-11-12). | [S12] |
| CLI | `az load test create --load-test-config-file`, `az load test-run create`; every command labelled Preview, Azure CLI 2.66.0+ (2026-11-12). Useful for the spike, not the target path. | [S5], [S6] |

## 8. Next steps

1. **Spike**: one real ALT run from Azure DevOps with a minimal `.jmx`, a YAML
   and `AzureLoadTest@1`. Validate:
   - fail-criteria syntax: the reference shows both a flat list and
     `clientMetrics` / `serverMetrics`, and uses both `responseTimeMs` and
     `response_time_ms`;
   - that a failed criterion fails the task, and what the published results hold;
   - one `appComponents` entry with a server-metric criterion;
   - env, CSV split and one Key Vault secret read in the `.jmx`;
   - `referenceIdentities` kinds `Metrics` and `Engine`.
2. **Pipeline template** from the spike's working YAML, with the check step of
   section 5.
3. **Skill and scaffold**: `.jmx` template, YAML example, CSV conventions, and the
   skill. k6 untouched.

## 9. Open questions

| Question | Who |
|---|---|
| Which existing ALT resource and resource group the spike uses | Keber + Azure owner |
| Who installs the Marketplace extension in the ADO organization | ADO org admin |
| Network access to QA hosts: public with allow-list, or VNet injection | Network / security |
| Cost owner and monthly VUH cap | Keber + finance |
| Session strategy: service-account login with password in Key Vault | Write approver |
| What usage data decides keep or deprecate k6, and when it is reviewed. The k6 skill was ported from `marcela.berriosc`'s work; she should be part of that call. | Keber, `marcela.berriosc` |

## Sources

Checked 2026-11-17 unless marked.

- [S1] What is Azure Load Testing (overview, updated 2026-06-11):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/overview-what-is-azure-load-testing>
- [S2] Load test configuration YAML reference (updated 2026-10-28):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/reference-test-config-yaml>
- [S3] Use secrets and environment variables (2026-11-12):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-parameterize-load-tests>
- [S3b] Define load test fail criteria (seen in search, not read in full):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-define-test-criteria>
- [S5] `az load test` (Preview, 2026-11-12):
  <https://learn.microsoft.com/en-us/cli/azure/load/test?view=azure-cli-latest>
- [S6] `az load test-run` (Preview, 2026-11-12):
  <https://learn.microsoft.com/en-us/cli/azure/load/test-run?view=azure-cli-latest>
- [S7] Configure CI/CD for load tests:
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-configure-load-test-cicd>
- [S8] Azure Pipelines `AzureLoadTest@1` task:
  <https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/reference/azure-load-test-v1>
- [S11] Azure App Testing pricing (unit prices are placeholders):
  <https://azure.microsoft.com/en-us/pricing/details/app-testing/>
- [S12] Manage usage limits (2026-11-12):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-manage-usage-limits>
- [S13] Load test private endpoints:
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-test-private-endpoint>
- [S14] Use managed identities:
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-use-a-managed-identity>
- [S15] Assign roles:
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-assign-roles>
- [S16] Resource limits, quotas and capacity:
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/resource-limits-quotas-capacity>

## Not verified

- VUH unit prices.
- Key Vault RBAC (`Key Vault Secrets User`) vs access policies for ALT secret
  references.
- Availability of Azure-specific JMeter plugins in ALT engines.
- Fail-criteria syntax (flat list vs `clientMetrics` / `serverMetrics`;
  `responseTimeMs` vs `response_time_ms`).
- `referenceIdentities` kinds beyond `KeyVault` (docs disagree).
- Locust GA date (aggregator, not the Azure Updates page itself).
