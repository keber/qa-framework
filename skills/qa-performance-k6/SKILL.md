---
name: qa-performance-k6
description: >
  Optional stage of the QA pipeline, with no order dependency. Plans, runs and
  reports a targeted k6 performance test of one or a handful of named API
  endpoints: single-endpoint timing, or baseline vs candidate (V1 vs V2, before
  vs after a fix) under concurrent load. Produces a complete markdown report
  (verdict against exit criteria declared before the run, avg/p90/p95/p99/max
  and throughput per endpoint, status codes, checks, limitations) plus the raw
  k6 summary. Use when asked to measure the performance or latency of an
  endpoint, compare two versions under load, run a load, stress, spike or soak
  test of specific endpoints, or whenever a "prueba de carga" or "performance"
  test of named endpoints is requested. Requires the load scaffold in
  qa/07-automation/load/k6/ and k6 installed by the user.
---

# QA Skill: Performance testing with k6 (optional stage)

**Stage**: Optional - Performance. No pipeline order dependency  
**Prerequisite**: the endpoints are known (method, path, a representative body), usually from a prior API or read/write task or given by the QA owner. The load scaffold exists in `qa/07-automation/load/k6/` (installed by `init`)  
**Output**: `qa/05-test-execution/performance/{date}-{topic}/` with `k6-report-{topic}-{stamp}.md` (the complete report), `k6-summary-{topic}-{stamp}.json` (raw k6 summary) and `plan-{topic}-{stamp}.json` (the plan as it ran), written by `run-perf.js` in the same step as the run  
**Next stage**: none required. Findings that are defects go to `qa/06-defects/` or ADO as usual

> **Blocking rules**
> 1. This skill implements `qa/00-standards/write-safety-policy.md` section 6 (writes under load) and section 7 (environment). Read both before writing a plan. This skill does not restate or relax them; when it seems to disagree, the policy wins.
> 2. Never run against anything but the QA environment of `project.qaBaseUrl`. Never a host containing `prod`.
> 3. Never load-test a write endpoint without an explicit, capped authorization from the write approver, confirmed back before the run.
> 4. Never put a credential in a plan, a command line, a report or a commit.
> 5. Never adjust an exit criterion after seeing the result, and never report a result with failed calls as met.

This skill complements, it does not replace, broad volume scenarios run with other
tools (JMeter, a cloud load service). Use it for a quick, targeted, reproducible run
against one or a few endpoints.

---

## ISTQB framing (CT-PT)

Every run answers a question stated before it starts. These six points are what make
a k6 number evidence instead of an anecdote.

1. **Name the test type before running.** `testType` in the plan is required:
   - `load`: expected concurrent usage (a short ramp, a hold at the expected users);
   - `stress`: push past normal capacity to find where it breaks;
   - `spike`: a sudden burst (for example many users retrying the same action at once);
   - `soak`: sustained load over a long duration, to catch degradation and leaks;
   - `concurrency`: the same operation by several users at the same moment, usually to reproduce a race;
   - `smoke`: one VU, a few calls, to check the plan works before a real run.
   "Run k6" is not a test type.
2. **Percentiles and throughput, never the average alone.** The report gives
   avg/min/med/p90/p95/p99/max and req/s per endpoint. Summarize with p95 (and p99
   when there are enough calls) plus throughput. An average hides the tail that users feel.
3. **Exit criteria declared before the run, not fitted to the result.**
   `exitCriteria.p95Ms` and `exitCriteria.source` are required; `p99Ms`,
   `minThroughputRps` and `perEndpoint` budgets are optional. Agree them with the QA
   owner, or state them as an assumption in `source`, BEFORE the run. The runner saves
   the plan into the evidence folder before k6 starts, so the criteria on record are
   the ones that ran. If a criterion turns out to be wrong, change it for the NEXT run
   and say so; never rewrite the verdict of this one.
4. **Baseline vs candidate.** When comparing two versions, or before and after a fix,
   the older one is the baseline and the newer one is the candidate validated against
   it. Put both in the same plan so they run in the same window under the same load,
   and declare the comparison criterion in `comparison.pairs` (`maxRegressionPct` on
   p95, `minSpeedup` on avg). A baseline from an earlier run (`baselineSummary`) is
   comparable only under the same load, data and similar environment activity.
5. **Data representativeness.** State the record volume behind each endpoint in
   `dataVolume` (for example "about 5000 orders in QA"). A fast p95 over an empty or
   near-empty dataset is not evidence of real-world performance. The report flags every
   endpoint without a stated volume.
6. **Server-side monitoring.** Client timing alone cannot tell a slow endpoint from a
   saturated server. For anything beyond a quick check, watch the server (CPU, memory,
   errors, response times) during the window and record what was watched in
   `serverMonitoring`.

---

## Safety rules, and how the runner enforces them

`run-perf.js` checks all of these before it starts k6. A refusal names the rule and
the policy section, and nothing runs. Never edit `perf-guard.js` to get past one.

| Rule | Enforced by the runner | Policy |
|---|---|---|
| The `baseUrl` host equals the host of `project.qaBaseUrl` in `qa/qa-framework.config.json` | yes, rule `environment` | section 7 |
| The `baseUrl` never contains `prod`; an endpoint `path` is never a full URL | yes, rule `environment` / plan validation | section 7 |
| A write endpoint (POST, PUT, PATCH, DELETE) runs as one call: `"load": { "vus": 1, "iterations": 1 }` | yes, rule `write-under-load` | section 6 |
| More than one write call needs a `concurrentWrite` authorization within its cap, dated today | yes, rule `write-under-load` | section 6 |
| A plan with any write runs only with `--allow-writes` on the command line | yes, rule `write-opt-in` | section 2, gate 1 |
| A write endpoint names its approved write catalog entry in `writeCatalogId` | presence only; you verify the entry | section 2, gate 2 |
| Writes touch only the test's own records; records left behind follow the lifecycle | no: your bodies must do it | sections 2 (gate 4) and 5 |
| Every run has a go-ahead stating the account or lane: `goAhead.by`, `goAhead.account` | presence only; you obtain it | section 6 |
| No credential field (cookie, authorization, password, token...) anywhere in the plan | yes, rule `credentials` | this skill, "Credentials" |
| A session file is ignored by git | yes, when git is available | this skill, "Credentials" |

### Reads and POST queries

GET and HEAD are reads. POST is a write unless the endpoint is a query that takes its
filters in the body (paginated listings, searches). Declare such an endpoint with
`"query": { "confirmedBy": "...", "evidence": "..." }`: who confirmed it has no side
effect, and how. An endpoint that reserves a number, marks a record as seen, triggers
a send or generates a file is a write whatever its name says (policy section 1). PUT,
PATCH and DELETE are never queries.

Reads may ramp, starting low: a few VUs, a 30 s ramp, a 60 to 120 s hold. Load on
reads still degrades the shared QA environment for everyone, which is why the go-ahead
is required for every run.

### Concurrent write authorization (format)

Only when the write approver explicitly asks for concurrent load on a write endpoint
(for example to reproduce a race condition), for that endpoint and that run:

```json
"concurrentWrite": {
  "approvedBy": "the write approver named in write-safety-policy.md section 0",
  "approvedOn": "2026-11-12",
  "reason": "reproduce the duplicate-number race reported in defect 123",
  "maxVus": 5,
  "maxIterations": 10,
  "expectedRecords": 10,
  "account": "lane 2 / qa-perf-user",
  "confirmation": "where the confirmation back and the go-ahead in reply are recorded"
}
```

- The cap is `maxVus` plus `maxIterations` (for `{ vus, iterations }` loads) or
  `maxDuration` (for `stages` or `{ vus, duration }` loads). The runner refuses a load
  above the cap, and a time-based load with no `maxDuration`.
- `approvedOn` must be the day of the run: an authorization covers one run and is
  never reused from an old plan.
- Before running, confirm back to the approver: the endpoint, the cap, the expected
  number of records (`expectedRecords`) and the account; wait for an explicit go-ahead
  in reply; record where in `confirmation`.
- Use `bodies` (one body per VU) so concurrent writers act on their own prefixed test
  records, never on pre-existing data (policy sections 2 and 5).

---

## Credentials

The plan says where a session value comes from, never the value:

```json
"auth": { "scheme": "cookie", "sessions": [ { "env": "QA_PERF_SESSION" }, { "file": ".session/lane3.txt" } ] }
```

- `scheme`: `cookie` (sent as the `Cookie` header), `bearer` (`Authorization: Bearer`),
  `header` (with `headerName`, for an API key header) or `none`.
- `{ "env": "NAME" }`: an environment variable set in your shell for this run only.
  Never in a shared `.env`, CI default or the plan.
- `{ "file": "path" }`: a one-line file relative to the k6 folder that git ignores.
  The scaffold ignores `.session/`. The runner refuses a file git does not ignore.
- Several sessions are used round-robin by VU. Use independent sessions for concurrent
  runs: some servers serialize the requests of one session, which looks like a capacity
  problem but is not.
- How to obtain the value (a login script, a lane of the e2e setup, a token endpoint) is
  the project's own mechanism; reuse it, do not build a new login flow for this skill.
  A value expires: if a run fails with 401, refresh it and run again.
- The runner passes values to k6 only through the environment of the child process and
  never prints them. The report names the sources (variable names, file names), never
  their content.

---

## Process

### Step 1 - State the question

Write down, before anything else: which endpoints, which test type, the exit criteria
and who agreed them, and, for a comparison, which is the baseline. If the QA owner has
not given criteria, propose them as an explicit assumption and get agreement.

### Step 2 - Gather the endpoints

For each: method, path relative to the base URL, a representative body, the expected
status (and a JSON success field if the API has an envelope), and the data volume behind
it. Classify each as read, POST query (with evidence) or write. For a write, find its
approved entry in the project's write catalog (`qa/07-automation/integration/fixtures/write-catalog.ts`
when the integration scaffold is used); without one, stop and see the `qa-api-integration`
skill.

### Step 3 - Get the go-ahead

Ask the QA owner for the go-ahead for this run, stating the account or lane and the
load. For a concurrent write, follow the authorization format above, including the
confirmation back.

### Step 4 - Write the plan

Copy `plans/_example.plan.json` to `plans/{topic}.plan.json` and edit the copy. Keep
`tag` short and stable: it names the metrics and the report rows. Then validate:

```bash
cd qa/07-automation/load/k6
node run-perf.js plans/{topic}.plan.json --check
```

`--check` runs every validation and safety rule and resolves the sessions, but never
starts k6. Fix what it reports; never weaken `perf-guard.js` to pass.

### Step 5 - Run (the evidence is saved in the same step)

```bash
node run-perf.js plans/{topic}.plan.json                 # reads only
node run-perf.js plans/{topic}.plan.json --allow-writes  # the plan has write endpoints
```

If k6 is not installed, the runner stops and says so. Tell the user; do not install it
or any other tool yourself. The runner writes the report, the raw summary and the plan
copy into the evidence folder whether or not the criteria were met; a non-zero exit code
after "saved:" means a criterion was not met or a call failed, not that the run broke.

### Step 6 - Read and report the result

- Lead with the verdict per endpoint and the overall verdict, then p95, p99 and
  throughput. Never quote the average alone.
- `INVALID` means failed calls: say how many and which status codes (section 4 of the
  report), and do not present its timings as the endpoint's performance.
- `NOT MET` is a result, not a test failure: report it against the declared criterion.
- Endpoints with fewer than 30 calls have indicative percentiles only; the report says so.
- Carry the limitations (data volume, monitoring, shared environment, single run) into
  any summary you write. Copy tables from the report; do not retype numbers.
- Rebuild a report from saved files with `node build-report.js <summary.json> <plan.json> <out.md>`.

---

## Reading the result

| Verdict | Meaning |
|---|---|
| `MET` | Every call succeeded and every declared budget was met |
| `NOT MET` | Every call succeeded, and at least one budget was missed (the reason is in the row) |
| `INVALID` | At least one call failed (status, JSON success field, timeout). Never read as performance |
| `NO DATA` | No call completed, or a baseline was not loaded |

The run is `MET` only when every endpoint and every comparison is `MET`. Zero failed
calls is always part of the exit criteria.

---

## Plan reference

The full shape is in `plans/plan.schema.json`; the runner enforces it. Required:
`topic`, `testType`, `baseUrl`, `goAhead`, `auth`, `exitCriteria` (`p95Ms`, `source`),
`endpoints` (`tag`, `method`, `path`), and a `load` on the plan or on every endpoint.

Load shapes, per plan or per endpoint:

| Shape | k6 executor | Number of calls |
|---|---|---|
| `{ "stages": [ { "duration": "30s", "target": 3 }, ... ] }` | ramping-vus | open |
| `{ "vus": 3, "duration": "2m" }` | constant-vus | open |
| `{ "vus": 1, "iterations": 1 }` | shared-iterations | exactly `iterations` |

Each endpoint runs in its own scenario, all at the same time, so endpoints do not
starve each other inside one loop; each endpoint's timing includes the contention the
others cause on the server.

Optional: `comparison`, `context` (sentences printed in the report), `serverMonitoring`,
`requestTimeout` (default `60s`), `thinkTimeSeconds` (default 1), `outDir` (relative to the
k6 folder), and per endpoint `body` or `bodies`, `query`, `expect`, `dataVolume`,
`writeCatalogId`, `concurrentWrite`.

If `qa/07-automation/load/k6/` is missing in a project installed before this skill
existed, copy the files of `node_modules/@keber/qa-framework/templates/load-scaffold/k6/`
into it, and add a `.gitignore` there with the line `.session/`. Do not overwrite files
that already exist.
