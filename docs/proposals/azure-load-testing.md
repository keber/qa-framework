# Proposal: running framework performance plans in Azure Load Testing

Status: research only (WP3.2). Nothing in this document ships in the package and
nothing here has been built. No Azure resource was created and no Azure or ADO
API was called while writing it.

Date the sources were checked: 2026-11-12.

## Summary

- The QA lead's "Azure app testing" is Azure Load Testing (ALT), now documented
  under the **Azure App Testing** product umbrella (Learn URLs moved to
  `azure/app-testing/load-testing/`).
- **ALT does not run k6 scripts.** The official overview states that ALT supports
  Apache JMeter and Locust and no other framework; the test configuration YAML
  accepts `testType` values `URL`, `JMX` and `Locust` only. Our scaffold
  (`templates/load-scaffold/k6/`) cannot be uploaded to ALT as it is.
- So "run our k6 plans in ALT" really means "translate a validated plan into a
  Locust (or JMeter) script plus an ALT YAML". The plan, the guard and the
  exit criteria carry over; the k6 script does not.
- The key risk is that a cloud run happens outside `run-perf.js`, so the local
  guard (`perf-guard.js`) is not in the path unless we put it there and take the
  other paths (portal, ad hoc CLI) away from humans.
- **Recommendation: C now (do nothing in the package), with A as a time-boxed
  spike once four human decisions are made** (section 6). B (pipeline template)
  only after A has produced one real run.

## 1. What ALT accepts today

| Topic | Finding | Source |
|---|---|---|
| Script frameworks | Apache JMeter (`.jmx`), Locust (`.py`), and URL-based quick tests. "Does not support other testing frameworks than Apache JMeter and Locust." k6 is not mentioned. | [S1], [S2] |
| k6 | No official page found. Secondary blogs claim k6 support; they cite no Microsoft source and one other review contradicts them. Treated as **not supported**. | [S1], [S2], search 2026-11-12 |
| Config format | YAML, `version: v0.1`. Keys: `testId` (2-50 chars, `[a-z0-9_-]`), `testType`, `testPlan`, `engineInstances` (required), `description` (max 100), `configurationFiles`, `zipArtifacts` (JMX and Locust only), `properties.userPropertyFile`, `splitAllCSVs`, `env`, `secrets`, `certificates`, `referenceIdentities`, `keyVaultReferenceIdentity`, `failureCriteria`, `autoStop`, `subnetId`, `publicIPDisabled`, `appComponents`, `regionalLoadTestConfig`. | [S2] |
| Fail criteria | `Aggregate(client_metric) condition threshold`, per request: `RequestName: avg(latency) > 200`. Client metrics: `response_time_ms` (avg, min, max, p50 to p9999), `latency`, `error` (percentage, `>` only), `requests_per_sec` (avg), `requests` (count). Server metrics from Azure Monitor (`resourceId`, `metricNamespace`, `metricName`, `aggregation`, `condition`, `value`). Request names must match the JMeter sampler name or the Locust request name. | [S2], [S3b] |
| Auto-stop | `autoStop: disable` or `{ errorPercentage (default 90), timeWindow (default 60 s) }`. | [S2] |
| Portal | Create test, upload script, set parameters, run. | [S4] |
| CLI | `az load test create --load-test-config-file <yaml>` (also `--test-plan`, `--test-type {JMX, Locust, URL}`, `--engine-instances`, `--env`, `--secret`, `--subnet-id`); `az load test file upload`; `az load test-run create --test-id --test-run-id` (waits by default, `--no-wait` to skip). The `load` extension needs Azure CLI 2.66.0+ and **every command is labelled Preview**. | [S5], [S6] |
| Azure Pipelines | `AzureLoadTest@1`: `azureSubscription`, `loadTestConfigFile`, `resourceGroup`, `loadTestResource`; optional `secrets`, `env`, `overrideParameters`, `outputVariableName`, `waitForCompletion`. "Succeeds if the load test finishes successfully and all test criteria pass." | [S7], [S8] |
| GitHub Actions | `azure/load-testing@v1` with `loadTestConfigFile`, `loadTestResource`, `resourceGroup`, optional `env`, `secrets`. Exit-code behaviour on failed criteria: **not confirmed** on the page read. | [S7] |
| Identity for CI | Service principal or OIDC with role **Load Test Contributor** scoped to the load testing resource. | [S7] |
| REST API | Data-plane API, current `api-version=2026-04-01`: `PUT /tests/{testId}/files/{fileName}` (one file per call, 50 MB cap), `PATCH /test-runs/{testRunId}`, `GET /test-runs/{testRunId}/files/{fileName}`. Exact 2026-04-01 English pages were only seen in search results, **not read in full**. | [S9], [S10] |
| Billing | Per Virtual User Hour (VUH), two tiers (0-10,000 VUH, above). Unit prices did not render on the official page; secondary sources quote USD 0.15 and 0.06 per VUH (**unconfirmed**). Minimum per run: 10 VUs per engine for the run duration, and 10 minutes if the run is shorter. No monthly resource fee found. | [S11] |
| Spend control | Monthly VUH limit per resource (portal only, best effort, may slightly exceed). When reached, new runs are refused and running tests stop. | [S12] |
| Private hosts | VNet injection: `subnetId` in the YAML. The VNet must be in the same subscription and region as the ALT resource; the run creates engine VMs, a public IP, an NSG and a load balancer in our subscription (the last two billed). `publicIPDisabled: true` removes them but then needs NAT Gateway, Firewall or an NVA for outbound. Requires Network Contributor on the VNet. | [S13] |

## 2. Mapping our k6 plan and runner to ALT

### 2.1 What carries over

| Ours | ALT equivalent | Note |
|---|---|---|
| `plans/<topic>.plan.json` (validated) | Source of truth for a generated Locust script + YAML | The plan stays the reviewed artifact; generated files are derived, never hand-edited. |
| `exitCriteria.p95Ms`, `p99Ms`, `perEndpoint` | `failureCriteria` per request: `<tag>: p95(response_time_ms) > <p95Ms>` | Request name in the generated script = endpoint `tag`, so criteria bind per endpoint. |
| Implicit "zero failed calls" (`failedcalls_<tag> count<1`) | `<tag>: percentage(error) > 0` | ALT `error` only supports `>`; `> 0` gives the same rule. |
| `minThroughputRps` | `<tag>: avg(requests_per_sec) < <value>` | Average, not the k6 rate; wording differs slightly. |
| `load` (stages, vus+iterations, vus+duration) | Locust users, spawn rate, run time (Locust custom `LoadTestShape` for stages) | `shared-iterations` has no direct Locust equivalent; needs a counter in the script. **Not prototyped.** |
| `expect.status`, `expect.jsonField/jsonValue` | Locust `catch_response` checks | Straight translation. |
| `auth.sessions` (env names) | ALT `secrets` (Key Vault URIs), read in Locust with `os.getenv` | Section 4. |
| `comparison.pairs` | No ALT equivalent | ALT compares whole runs in the portal, not two endpoints in one run. Our comparison must be computed from downloaded results. |

### 2.2 What does not carry over

- **`perf-script.js`**: k6 only. A Locust equivalent (`perf-locustfile.py`,
  plan-driven like the k6 script) would have to be written and tested. That is a
  second script engine to maintain, and it means Python in a Node package.
- **`run-perf.js` session handling** (`.session/` files, env pass-through): ALT
  engines cannot read a local gitignored file. Sessions must come from Key Vault.
- **`build-report.js`**: reads a k6 `handleSummary` JSON. ALT produces its own
  dashboard and downloadable results (`az load test-run download-files`); the
  report builder would need an ALT-results adapter. Format **not investigated**.
- **`perf-guard.js` as a gate**: it still validates the plan, but nothing in ALT
  calls it. This is the problem in 2.3.

### 2.3 Enforcing the write-safety policy in a cloud run (key risk)

Locally, the guard sits in the only path to k6: `run-perf.js` refuses before k6
starts. In ALT there are at least four paths to a run: the portal, `az load`,
the pipeline task and the REST API. Any of them can upload an arbitrary script or
edit the YAML (users, engines, env) without the guard ever seeing it. Writing the
guard into a generator is therefore **not enough**; the policy needs controls that
hold even when someone bypasses the generator.

| Policy rule | Local enforcement today | Cloud enforcement needed (layered) |
|---|---|---|
| Sec 7: target host = host of `project.qaBaseUrl`, never prod | `perf-guard.js` host check | 1) generator refuses (same guard); 2) generated script hard-codes the host and refuses any other at start-up; 3) **network**: VNet injection into a subnet whose NSG allows outbound only to the QA host, so a hand-edited script cannot reach prod even if uploaded. 3 is the only layer that survives a bypass. |
| Sec 2 gate 1: write opt-in (`--allow-writes`) | CLI flag, not env var | Pipeline parameter that defaults to false and requires a manual approval check (Azure Pipelines environment approval or GitHub environment reviewers). |
| Sec 2 gate 2: `writeCatalogId` | Presence check | Same guard in the generator / pipeline step. |
| Sec 6: write = 1 VU, 1 iteration unless `concurrentWrite` | Guard refuses | Guard in the pipeline step, **plus** `engineInstances: 1` fixed and a YAML hash check (pipeline recomputes the YAML from the plan and fails if the committed one differs). |
| Sec 6: concurrent write caps, `approvedOn` = run date | Guard refuses | Guard runs on the pipeline agent on the run date; the approval check records who approved. |
| Sec 6: go-ahead with account or lane | Required plan fields | Same, plus the pipeline approval as the recorded go-ahead. |
| Runaway load in general | Plan caps | `autoStop` with a low `errorPercentage`; monthly VUH limit on the resource as a cost and blast-radius ceiling. |

And the RBAC piece that makes the above mean anything:

- Only the pipeline identity holds **Load Test Contributor** on the resource.
  QA engineers get a read-only role (Load Test Reader, by name; role **not confirmed** in the pages read) only. Without this, any
  contributor can create a test in the portal and bypass every layer above
  except the network.
- The resource's managed identity can read the Key Vault secrets; per [S14],
  "anyone authorized to run load tests" can use that identity during a run.
  This is a second reason to keep run permission on the pipeline identity only.

Residual risk, stated plainly: an Owner or Contributor on the subscription can
always change RBAC, the NSG or the YAML. The design limits accidents and
casual bypass, not a determined administrator. That is the same trust level as
the local runner, where a developer can edit `perf-guard.js`.

## 3. Secrets

- The plan keeps naming where a session comes from, never the value
  (`auth.sessions[].env`). For ALT, each name maps to an ALT `secrets` entry
  whose value is a **Key Vault secret URI**, not the secret ([S2], [S3]).
- ALT stores only the URI and fetches the value on each run; values passed from
  CI are not kept after the run ([S3]).
- Access is through the ALT resource's managed identity (system- or
  user-assigned), granted Get on secrets in the vault and named in
  `keyVaultReferenceIdentity` or `referenceIdentities` with `kind: KeyVault`
  ([S2], [S14]). [S3] documents the access-policy model; whether Key Vault
  RBAC (`Key Vault Secrets User`) works equally is **not confirmed**.
- In Locust the secret arrives as an environment variable (`os.getenv`), which
  matches our current env-based session model ([S3]).
- Pipeline authentication should use OIDC / workload identity federation, not a
  stored client secret ([S7] mentions OIDC for GitHub).
- Open issue: our sessions are short-lived cookies or tokens obtained by a login
  step. Someone must refresh the Key Vault secret before each run, or the script
  must log in itself with a service account whose password is in Key Vault. The
  second option puts a reusable credential in the vault and needs the write
  approver's sign-off. Not decided here.
- Nothing in this design puts a credential in a plan, a YAML or the repo; the
  YAML holds only vault URIs, which are not secret but do reveal vault names, so
  the generated YAML should still live under the project's QA folder, not in a
  public place.

## 4. Options

| | A) Generator, human runs | B) CI pipeline template | C) Do nothing yet |
|---|---|---|---|
| What we build | `node generate-alt.js plans/x.plan.json` -> runs the guard, emits `alt/<topic>/locustfile.py` + `alt/<topic>/alt-test.yaml`. Human runs `az load test create` / `test-run create` or uploads in the portal. | A + an Azure Pipelines YAML (and maybe GitHub Actions) that regenerates, verifies the hash, runs the guard, waits for approval, calls `AzureLoadTest@1`, downloads results. | Keep k6 local. Document that ALT needs Locust/JMeter. |
| Package effort | Medium: Locust script engine, YAML emitter, criteria mapping, tests. Python in a Node package (end users need Python only for local Locust debugging; ALT runs it). | High: A + pipeline template, approvals, docs for service connections. | None. |
| Guard holds in cloud? | Only if the human uses the generator. Portal bypass is open unless RBAC is set as in 2.3. | Yes, when combined with RBAC (only pipeline can run) and VNet egress restriction. | N/A (local guard holds). |
| Azure provisioning (not by us) | ALT resource, Key Vault, managed identity, VNet subnet + NSG if QA host is private, RBAC. | Same + service connection / federated identity, pipeline environment with approvers. | None. |
| Running cost | VUH per run + minimums; VNet LB/public IP during runs. | Same. | k6 local: none. |
| Risk | Two script engines can drift (k6 vs Locust). | Same + pipeline is framework-owned but project-specific (subscription, resource names). | QA lead does not get Azure runs yet. |

Other options considered and dropped:

- **JMeter (.jmx) instead of Locust.** JMX is XML, verbose to generate and
  harder to review in a PR. Locust is closer to our plan-driven k6 script. JMeter
  only wins if the QA team already writes JMX; ask (section 7).
- **Run k6 in Azure without ALT** (Azure Container Instances, or Grafana Cloud
  k6). Keeps one script engine, but is not what was requested, has no ALT
  dashboard, and Grafana Cloud is a second vendor. Worth naming if the real goal
  is "more load than one laptop" rather than "ALT specifically".

## 5. Recommendation

**C now, A as a spike after the decisions below; B only after A has one real run.**

Why: the request assumed ALT runs k6, and it does not. Building A means a second
script engine (Locust) in the package, which is a real maintenance cost and needs
to be justified by an actual need for cloud-scale load. The current plans
(handfuls of endpoints, single-digit VUs, per the example plan and section 6 of
the policy) fit on one machine with k6. A spike is cheap only once a subscription
and a reachable QA host exist; without them nothing can be verified.

If A goes ahead, the minimum safe shape is:

1. Generator reuses `perf-guard.js` unchanged (no second copy of the rules).
2. Generated script refuses any host but the plan's, by construction.
3. `engineInstances: 1`, `autoStop` on, VUH monthly limit set on the resource.
4. Only a pipeline identity can run; humans read results. Until B exists, a named
   person holds Load Test Contributor and is the recorded go-ahead.
5. VNet egress restricted to the QA host where the network allows it.

## 6. Decisions needed from humans

| Decision | Who | Why it blocks |
|---|---|---|
| Subscription and resource group for the ALT resource | IT / Azure owner | Nothing can be created or tested without it. |
| Resource ownership: who holds Owner / Load Test Contributor, who only reads | IT + QA lead | Section 2.3 depends on contributors being few. |
| Network access to the QA hosts: public with IP allow-list, or private (VNet injection, same region and subscription) | Network / security | Decides `subnetId`, NSG egress rule, and whether the host check can be enforced by the network. |
| Cost owner and monthly VUH cap | QA lead + finance | Sets the usage limit and who approves overruns. |
| Session strategy in the cloud: refreshed token in Key Vault vs service-account login | Write approver (policy section 0) | A stored reusable credential needs explicit approval. |

## 7. Open questions for the QA lead

1. Is the goal ALT specifically (dashboard, Azure Monitor server metrics,
   Azure-native reporting), or simply more load than a laptop can generate?
2. Does the team already write JMeter (.jmx) or Locust scripts? Which would you
   rather review?
3. What load sizes do you expect? If plans stay under tens of VUs, local k6 is
   enough and ALT adds cost and setup without new information.
4. Are the QA hosts reachable from the internet, or only inside the corporate
   network / a VNet?
5. Should server-side metrics (App Service or VM CPU, memory) be part of the
   pass/fail criteria? ALT can do that via Azure Monitor; local k6 cannot.
6. Who will be the cost owner, and is there a budget for VUH per month?
7. Is it acceptable for the framework to ship Python (a Locust script) alongside
   the Node tooling?

## Sources (checked 2026-11-12)

- [S1] What is Azure Load Testing (overview, updated 2026-06-11):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/overview-what-is-azure-load-testing>
- [S2] Load test configuration YAML reference (updated 2026-10-28):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/reference-test-config-yaml>
- [S3] Use secrets and environment variables (updated 2026-06-11):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-parameterize-load-tests>
- [S3b] Define load test fail criteria (seen in search, not read in full):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-define-test-criteria>
- [S4] Create and manage tests:
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-create-manage-test>
- [S5] `az load test` (Preview):
  <https://learn.microsoft.com/en-us/cli/azure/load/test?view=azure-cli-latest>
- [S6] `az load test-run` (Preview):
  <https://learn.microsoft.com/en-us/cli/azure/load/test-run?view=azure-cli-latest>
- [S7] Manually configure CI/CD for load tests (updated 2026-06-11):
  <https://learn.microsoft.com/en-us/azure/load-testing/how-to-configure-load-test-cicd>
- [S8] Azure Pipelines Azure Load Testing task (updated 2026-09-23):
  <https://learn.microsoft.com/en-us/azure/devops/pipelines/tasks/test/azure-load-testing>
- [S9] REST data plane, Upload Test File (2022-11-01 read via search; 2026-04-01 seen only in localized results):
  <https://learn.microsoft.com/en-us/rest/api/loadtesting/dataplane/load-test-administration/upload-test-file?view=rest-loadtesting-dataplane-2022-11-01>
- [S10] REST data plane, Create Or Update Test Run (2026-04-01):
  <https://learn.microsoft.com/en-us/rest/api/loadtesting/dataplane/load-test-run/create-or-update-test-run?view=rest-loadtesting-dataplane-2026-04-01>
- [S11] Azure App Testing pricing (unit prices did not render):
  <https://azure.microsoft.com/en-us/pricing/details/app-testing/>
- [S12] Manage usage limits (updated 2026-06-11):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-manage-usage-limits>
- [S13] Load test private endpoints (updated 2026-06-12):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-test-private-endpoint>
- [S14] Use managed identities (updated 2026-06-11):
  <https://learn.microsoft.com/en-us/azure/app-testing/load-testing/how-to-use-a-managed-identity>

## Not confirmed

- Any official k6 support in ALT (none found; secondary blogs claim it).
- VUH unit prices (official page did not render them).
- GitHub Action exit code when fail criteria fail.
- Whether Key Vault RBAC (instead of access policies) is supported for ALT
  secret references.
- How Locust user count, spawn rate and run time are set through the ALT YAML
  (env variables vs a `.conf` user property file); [S2] lists
  `properties.userPropertyFile` for Locust but the exact keys were not checked.
- The ALT results download format, needed for a report-builder adapter.
- The 2026-04-01 REST pages in English were not read in full.
