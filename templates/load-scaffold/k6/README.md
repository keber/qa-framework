# k6 performance tests

Targeted performance runs against one or a handful of named API endpoints:
single-endpoint timing, or baseline vs candidate (V1 vs V2, before vs after a fix)
under concurrent load. Read `.github/skills/qa-performance-k6/SKILL.md` before
writing a plan, and `qa/00-standards/write-safety-policy.md` sections 6 and 7
before running one.

## Files

| File | Owner | Role |
|---|---|---|
| `run-perf.js` | framework | Validates the plan, enforces the safety rules, runs k6, saves the report |
| `perf-guard.js` | framework | Plan validation and safety rules (pure functions, tested) |
| `perf-script.js` | framework | The plan-driven k6 script; started only by `run-perf.js` |
| `build-report.js` | framework | Builds the markdown report from a saved k6 summary and its plan |
| `plans/plan.schema.json` | framework | Plan shape (editor validation; the runner enforces it itself) |
| `plans/_example.plan.json` | framework | Example plan; copy it, do not edit it |
| `plans/<topic>.plan.json` | you | Your plans |
| `.session/` | you | Session files, if you use files. Ignored by git; never commit it |

## Run

k6 must be installed by you (<https://grafana.com/docs/k6/latest/set-up/install-k6/>).
The runner never installs anything. Node.js runs the runner; no npm install is needed.

```bash
cd qa/07-automation/load/k6
node run-perf.js plans/<topic>.plan.json --check   # validate only, k6 not started
node run-perf.js plans/<topic>.plan.json           # validate, run, save the report
```

The report, the raw k6 summary and a copy of the plan land in
`qa/05-test-execution/performance/<date>-<topic>/` (or the plan's `outDir`).
Rebuild a report from saved files with:

```bash
node build-report.js <k6-summary.json> <plan.json> <out.md>
```

## Sessions

The plan never holds a credential. `auth.sessions` names where each session value
comes from:

- `{ "env": "QA_PERF_SESSION" }`: an environment variable you set in your shell
  for this run only, never in a shared `.env` or CI default;
- `{ "file": ".session/lane2.txt" }`: a one-line file, relative to this folder,
  that git ignores. The runner refuses a file git does not ignore.

How the value is obtained (a login script, a browser session, a token endpoint) is
the project's own business. The runner passes values to k6 only through the
environment and never prints them.
