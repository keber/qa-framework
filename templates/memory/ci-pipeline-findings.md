# CI Pipeline Findings

> Document CI pipeline issues, root causes, and applied fixes as they are discovered.
> This file is loaded by the agent when diagnosing CI failures or reviewing pipeline changes.

## Applied Fixes

Document each fix that was applied to the pipeline or test setup. Use a table or prose - whatever fits the change.

| Problem | Root cause | Fix applied |
|---|---|---|
| _Add pipeline issue here_ | _Root cause_ | _What was changed and where_ |

> Examples: auth setup defaults, missing reporter packages, artifact name collisions,
> browser binary not installed in a CI stage, grep flag escaping issues.

## Known Limitations

Document constraints that are accepted but not fixed (timeout budgets, worker counts, retry behavior).

> Examples:
> - Full suite exceeds the CI timeout with 1 worker. Workaround: run only P0/P1 tags by default.
> - `retries: 2` counts each attempt separately, so reported execution count exceeds test count.
> - Attachment upload warnings on `PublishTestResults` when multiple failures share filenames.

## Failure Triage Categories

Use these categories when classifying CI failures. Add project-specific categories as needed.

| Category | Description | Action |
|---|---|---|
| TIMEOUT | Test exceeded its time budget | Adjust `timeout` in the spec or in `playwright.config.ts` |
| SESSION | Auth session expired mid-run | Implement session-refresh fixture or reduce suite duration |
| FLAKY | Intermittent failure, passes on retry | Acceptable if retries cover it; investigate if failure rate > 20% |
| APP-DEFECT | Application does not meet the spec | Open defect file; mark test with `test.fail()` |
| TEST-CODE | Selector or assertion is wrong in CI | Fix the spec file |
