# Review request: wave 3 - k6 performance skill

**For**: marcela.berriosc
**Prepared by**: the release coordinator, 2026-11-12
**Release candidate**: `@keber/qa-framework@1.14.0-rc.5` or later (npm dist-tag `next`)
**Status**: awaiting your review, together with `docs/review-wave2.md`, before 1.14.0 is promoted to `latest`

## Why you are asked

Wave 3 ports the k6 performance skill you wrote in your project into the framework,
as an optional stage. Its safety rules come from the write-safety policy you already
reviewed in wave 2 (sections 6 and 7). Your decisions become the default for every
project that uses the framework.

Your own project is not affected: `upgrade` delivers the skill and its command, but it
never installs or edits the load scaffold in an existing project.

## What was ported

| Your original | In the framework |
|---|---|
| `.github/skills/qa-performance-k6/` | `skills/qa-performance-k6/SKILL.md` |
| Your k6 scripts and run procedure | `templates/load-scaffold/k6/`, installed by `init` as `qa/07-automation/load/k6/`: plan JSON with a schema, `run-perf.js` runner, `perf-guard.js`, `perf-script.js`, `build-report.js` |

What was deliberately NOT ported: your project's acceptance criteria and figures,
endpoints, accounts and system names.

## How to try it

In an empty folder, not in your project:

```bash
npm init -y
npm install @keber/qa-framework@next
```

The scaffold is in `qa/07-automation/load/k6/` (start with `plans/_example.plan.json`),
the skill in `.github/skills/qa-performance-k6/`. You need k6 installed to run a plan;
without it the runner stops and installs nothing.

## Decisions to review

1. **ISTQB framing is mandatory in the plan**: `testType` is required; exit criteria
   (`p95Ms` plus their `source`) are declared before the run, never fitted to the result.
2. **Report**: percentiles and throughput, never the average alone; an endpoint with any
   failed call is reported as INVALID, never as meeting its criteria.
3. **Environment check**: the plan's `baseUrl` must be on the host of
   `project.qaBaseUrl` and never contain `prod`; an endpoint path is never a full URL.
4. **A write runs as one call** (`vus: 1, iterations: 1`) unless the plan carries a
   `concurrentWrite` authorization from the write approver, dated the day of the run,
   with a cap on VUs and iterations or duration, the expected records and where the
   confirmation is recorded.
5. **Any write needs `--allow-writes`** on the command line, and must name its write
   catalog entry (`writeCatalogId`).
6. **POST as a query**: a POST that only filters (searches, paginated listings) may be
   declared a read, but only with who confirmed it has no side effect and how.
7. **Every run needs a go-ahead** naming the account or lane (`goAhead.by`,
   `goAhead.account`), reads included, because load on reads still degrades the shared
   QA environment.
8. **Credentials never go in a plan**: `auth.sessions` names an environment variable or
   a gitignored file; the runner refuses a session file git does not ignore, and never
   prints values.
9. **The k6 script imports no remote module.**
10. **JMeter and Azure Load Testing are not included.** A separate research note found
    that Azure Load Testing runs JMeter, Locust and URL tests, but not k6 scripts (per
    Microsoft's documentation as checked on 2026-11-12). Please confirm this matches
    what you saw; building toward Azure needs decisions on subscription, cost owner and
    network access to the QA hosts, so nothing was built.

## How to answer

A short note to Keber is enough: "OK", or the numbers you disagree with and why.
Disagreements are fixed in a new release candidate before promotion.
