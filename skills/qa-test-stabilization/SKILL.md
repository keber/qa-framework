---
name: qa-test-stabilization
description: >
  Stage 5b of the QA pipeline. Diagnoses and fixes failing or flaky Playwright
  tests. Classifies root causes, applies targeted fixes, and produces a
  stabilization report.
  Use when asked to fix failing tests, stabilize flaky tests, diagnose test
  failures, debug e2e tests, reduce test flakiness, or improve test reliability.
  Can be used any time after Stage 5 (Automation).
---

# QA Skill: Test Stabilization (Stage 5b)

**Stage**: 5b — Stabilization (parallel to / after Stage 5)  
**Prerequisite**: Failing or flaky tests exist in `qa/07-automation/e2e/`  
**Output**: Stable passing tests + `STABILIZATION-REPORT.md`  
**Next stage**: Return to Stage 5 to continue automation, or Stage 6 if all tests pass

> **Scope boundary**: Only fix tests inside `qa/07-automation/`. Do not modify application source code. Never introduce `waitForTimeout` as a stabilization fix.

---

## Inputs Required

1. Failure output — CI log, local run output, or list of failing test names
2. `qa/07-automation/e2e/{file}.spec.ts` — failing spec files
3. `qa/01-specifications/{module}/` — ground truth for expected behavior
4. `qa/07-automation/playwright.config.ts` — current runner config

---

## Process

### Step 1 — Reproduce locally

Run failing tests in isolation:
```
npx playwright test {file}.spec.ts --project={project} --reporter=list
```
Do not trust CI-only failures until reproduced, or classify immediately as Category H (CI environment).

### Step 2 — Classify each failure

Use the classification protocol: `references/classification-protocol.md`

Category summary:
- **A — Selector broken**: locator no longer matches; fix selector
- **B — Timing/flaky**: async operation not awaited correctly; replace with proper wait
- **C — Data conflict**: parallel test data collision; apply `EXEC_IDX`
- **D — Auth/session**: session expired or role mismatch; repair fixture
- **E — Spec mismatch**: behavior changed; update spec first, then test
- **F — Network dependency**: external call not mocked; add mock or skip
- **G — Environment**: missing env var or wrong base URL; fix config
- **H — CI environment**: OS/browser difference; add retry or tag as `@ci-skip`
- **I — Logic error**: test assertion does not match the spec; fix assertion 
  to match spec — **not** to match wrong app behavior. If the app is at fault, 
  use `test.fail()` instead of correcting the assertion direction.

### Step 3 — Apply fixes in priority order

Fix category priorities: A → C → D → B → I → E → F → G → H

For each fix:
1. Apply minimal change — do not refactor surrounding code
2. Re-run the specific TC to verify fix
3. Re-run the full describe block to verify no regression
4. Note confidence score (0-100) for each fix

**Category I special rule — assertion polarity:**  
Before flipping or weakening an assertion, confirm its direction against the 
spec. If the spec says the condition should hold and the app violates it → 
the original assertion was *correct* and the app is broken → use `test.fail()` 
+ open a defect. Do NOT invert the assertion.  
A test flipped from failing to passing by inverting its assertion is masking 
a defect - which is worse than a failing test.

### Step 4 — Confidence scoring

Calculate composite confidence:
- Consistent pass ×3 locally: +40
- Root cause identified and understood: +30
- No `waitForTimeout` introduced: +20
- Spec confirms expected behavior: +10

Target: ≥ 90 before marking TC as stable.

### Step 5 — Handle unresolvable failures

If a failure cannot be fixed without application code change:
- Add `test.skip(true, 'PENDING-CODE: {ADO item or description}')` annotation
- Update `qa/01-specifications/{module}/05-test-scenarios.md` with `PENDING-CODE` note

### Step 6 — Update spec if behavior changed (Category E)

Follow `qa-maintenance` skill for mid-sprint spec updates. Do not change spec to match wrong behavior.

### Step 7 — Re-run full suite

After all fixes applied, run the full module suite:
```
npx playwright test --project={module} --reporter=list
```
All previously failing TCs should pass or be explicitly skipped.

### Step 8 — Produce stabilization report

Template: `references/classification-protocol.md` (STABILIZATION-REPORT section)

Required sections:
- Run date + environment
- TC table: ID | Category | Root cause | Fix applied | Confidence | Status
- Summary: pass/fail/skip counts, blockers needing application fix
- Recommendations (if any systemic issues found)

---

## Key Rules

| Rule | Required |
|---|---|
| No `waitForTimeout` | Use `waitForSelector` or `waitForResponse` |
| No app code changes | Fix tests only, not application |
| Spec is ground truth | Never change spec to match wrong behavior |
| Unresolvable → skip | With PENDING-CODE annotation |
| Report required | Every stabilization session produces a report |

---

## Outputs

- Fixed spec files in `qa/07-automation/e2e/`
- `qa/07-automation/STABILIZATION-REPORT-{date}.md`
- Updated `qa/01-specifications/` (if Category E found)
