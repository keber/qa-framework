# Agent Instructions: Test Stabilization

**File**: `agent-instructions/04b-test-stabilization.md`  
**Purpose**: Instructions for exhaustively reviewing and stabilizing generated Playwright tests to ensure they are logically correct, technically sound, and free of false positives and false negatives before ADO integration.

---

## Stage Context

| Field | Value |
|-------|-------|
| Stage number | 3.5 |
| Stage name | Test Stabilization |
| Preceding stage | Stage 4 — Automation Generation (`04-automation-generation.md`) |
| Following stage | Stage 5 — ADO Integration (`05-ado-integration.md`) |
| Can be skipped? | No — ADO integration with unreliable tests produces misleading test run history |
| Required inputs | Generated `.spec.ts` files in `qa/07-automation/e2e/`; approved `05-test-scenarios.md` for the module |
| Produced outputs | Stabilized spec files; `STABILIZATION-REPORT.md` per submodule |
| Exit criterion | Confidence ≥ 90% that every test produces a true positive on failure and a true negative on pass |

---

## When to use

Run this stage immediately after **Stage 4 — Automation Generation** and before any ADO
integration or CI pipeline registration. This stage is mandatory regardless of whether tests
are passing or failing after generation.

Also re-run this stage when:
- Sprint changes introduce significant new test code (more than 3 new spec files)
- A test suite starts flaking in CI after a previously stable period
- A test is suspected of being a false positive (passing despite the feature being broken)
- A test is suspected of being a false negative (failing despite the feature being correct)

---

> **Scope boundary**: This stage operates exclusively on test code (`.spec.ts`, fixtures,
> helpers, `global-setup.ts`, `playwright.config.ts`). The application source code is
> strictly out of scope. Do not modify, patch, or work around application behavior to make
> tests pass — document the mismatch as a defect instead.

---

> **Coverage boundary**: Do not add new tests or increase coverage during this stage. If a
> gap in coverage is identified, note it in the STABILIZATION-REPORT.md for Stage 6
> (Maintenance) to address. The goal is correctness of existing tests, not completeness.

---

## Step 1 — Establish the Reference Baseline

Before running any tests, collect the ground truth against which correctness will be judged.

1. Open `05-test-scenarios.md` for the target module/submodule. For each TC row, note:
   - TC-ID and title
   - Priority (P0/P1/P2/P3)
   - Expected result (acceptance criterion)
   - Automatable status (Yes / Partial / No)

2. Open `COVERAGE-MAPPING.md` for the module. For each row:
   - Confirm the `.spec.ts` file and test function name exist
   - Flag any rows where the spec or function is missing (these are generation gaps, not
     stabilization issues — document in the report but do not create new tests)

3. If `05-test-scenarios.md` or `COVERAGE-MAPPING.md` are absent or incomplete, stop and
   complete Stage 4 before proceeding.

---

## Step 2 — First Run: Collect Baseline Results

Run the full suite for the target module without any modifications:

```bash
npx playwright test qa/07-automation/e2e/tests/{module-kebab}/ --reporter=list
```

Record the outcome of every test:

| TC-ID | Test title | Result | Notes |
|-------|-----------|--------|-------|
| TC-MOD-SUB-001 | ... | ✅ pass / ❌ fail / ⚠️ flaky / ⏭ skip | Error message if fail |

Collect trace artifacts for every failing test:

```bash
npx playwright test ... --trace=on
```

Do NOT make any changes yet. The first run result is the diagnostic baseline.

---

## Step 3 — Classify Every Failing or Skipped Test

For each non-passing test, determine its failure category before writing any code.

### Failure Categories

| Category | Definition | Correct action |
|----------|-----------|----------------|
| **A — Test Bug: Wrong selector** | The selector no longer matches the UI element | Fix selector in `.spec.ts` |
| **B — Test Bug: Wrong assertion** | The assertion does not match the specified acceptance criterion | Fix assertion to match spec |
| **C — Test Bug: Wrong flow** | The test steps don't reflect the actual user flow described in the TC | Rewrite steps to match TC |
| **D — Test Bug: Fragile timing** | Test fails intermittently due to missing `await`, race conditions, or missing `waitFor` | Add proper async handling |
| **E — Test Bug: Incorrect data** | Test data is malformed, not unique, or conflicts with QA environment state | Fix data generation or provisioning |
| **F — App Bug** | The test is correct and the application is not behaving as the TC specifies | Do not fix the test; file a defect |
| **G — TC Mismatch** | The spec TC is ambiguous or incorrect vs the actual implemented behavior | Do not fix the test or the app; update `05-test-scenarios.md` and note as a spec defect |
| **H — Infra / Environment** | Test fails due to QA environment unavailability, network, or credentials | Retry in a clean environment; do not classify as a test bug until confirmed |
| **I — Intentional skip** | Test is marked `test.skip()` due to a known defect or pending feature | Verify skip reason is still valid; update `06-defects/open/` reference |

For each failing test, write your classification in the working STABILIZATION-REPORT.md
before making any change.

### Decision Protocol

```
Is the test step sequence and assertion derived correctly from 05-test-scenarios.md?
  No → Category G (TC Mismatch — fix the spec, not the test)
  Yes ↓
Does the application behave as the TC acceptance criterion describes?
  No → Category F (App Bug — file a defect, skip the test with a DEF reference)
  Yes ↓
Does the failure appear in every run (deterministic)?
  No → Category D or H (timing or environment — diagnose further)
  Yes ↓
Is the failure caused by a selector, assertion, data, or flow issue in the test code?
  → Category A, B, C, or E (Test Bug — fix the test code)
```

---

## Step 4 — Fix Iterations

Apply fixes one category at a time, in this order: E → A → C → B → D.
(Data problems mask selector problems; flow problems mask assertion problems.)

After each batch of fixes, re-run the affected tests:

```bash
npx playwright test qa/07-automation/e2e/tests/{module-kebab}/{file}.spec.ts --reporter=list
```

Do not move to the next category until the current category's tests are stable across
**at least two consecutive runs**.

### Rules for fixing test code

- **Selectors**: prefer `getByRole`, `getByLabel`, `getByTestId` — avoid CSS/XPath selectors
  that depend on position or class names that aren't semantic
- **Assertions**: every assertion must trace back to a specific acceptance criterion in the TC;
  remove or replace any `expect().toBeVisible()` that does not correspond to a TC requirement
- **Waits**: prefer `await expect(locator).toBeVisible()` over `page.waitForTimeout()`;
  never use `waitForTimeout` as a fix for timing — diagnose the actual cause
- **Data**: use `EXEC_IDX + RUN_SALT` for unique identifiers (see ISSUE-02 note below);
  provision data in `beforeAll`, not inside individual tests
- **Skips**: when skipping for a Category F (App Bug), always include the defect reference:
  ```typescript
  test.skip(true, 'DEF-{NNN}: {one-line bug description}. Filed {YYYY-MM-DD}.');
  ```

> ⚠️ **EXEC_IDX collision**: Two runs within the same 60-second window produce identical
> `EXEC_IDX` values. For fields requiring guaranteed uniqueness, add a salt:
> ```typescript
> const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;
> const RUN_SALT = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
> ```

---

## Step 5 — Validate Passing Tests for False Positives

A passing test is not necessarily a correct test. After fixing failing tests, audit every
**passing** test for false positives.

For each passing test, perform one of the following checks:

### Negation check (preferred)
Temporarily modify the test to assert the opposite of the expected result, then run it.
If it still passes — the test is a false positive (asserting nothing meaningful).

```typescript
// Original: expect(toast).toHaveText('Guardado exitosamente');
// Negation check: replace temporarily with:
expect(toast).toHaveText('TEXTO_QUE_NO_EXISTE_JAMAS');
// If this passes → the original assertion is not actually evaluating the toast content
```

Restore the original assertion after the check.

### Trace review (secondary)
Open the Playwright trace for the passing test and step through it. Verify:
- Every action in the `test()` body corresponds to a step in the TC
- Every `expect()` is actually being evaluated (no skipped assertions due to early returns
  or unreachable code)
- The test does not pass because an early `expect()` short-circuits before the meaningful one

### API/network verification (for tests touching data persistence)
For tests that create, update, or delete records: after the UI action, verify the result
is persisted, not just that a success toast appeared. A test that only checks the toast
is a false positive if the actual save fails silently.

---

## Step 6 — Iteration and Convergence

Repeat Steps 4 and 5 until:

1. All deterministic failures are resolved (either fixed or legitimately skipped with a
   defect reference)
2. All passing tests have passed the negation check or trace review
3. No test produces intermittent results across 3 consecutive runs

**Confidence scoring**: after each iteration, estimate confidence per test:

| Confidence | Criteria |
|-----------|---------|
| ✅ High (≥90%) | Passed negation check AND matches TC acceptance criterion exactly |
| ⚠️ Medium (70–89%) | Passes consistently; trace reviewed; no negation check yet |
| ❌ Low (<70%) | Intermittent, unclassified failure, or negation check not attempted |

The stage is complete when **all tests are ✅ High or legitimately skipped** (Category F
with a defect reference or Category I with a valid skip reason).

---

## Step 7 — Document Findings

For each submodule, create or update `STABILIZATION-REPORT.md` in the module's automation
directory:

```
qa/07-automation/e2e/tests/{module-kebab}/STABILIZATION-REPORT.md
```

### STABILIZATION-REPORT.md structure

```markdown
# Stabilization Report — {MODULE} > {SUBMODULE}

**Date**: YYYY-MM-DD  
**Sprint**: {sprint number or label}  
**Analyst**: {agent session name or human name}  
**Spec reference**: `qa/{module-key}/{submodule-key}/05-test-scenarios.md`

## Summary

| Metric | Value |
|--------|-------|
| Tests evaluated | N |
| Tests stabilized (now ✅ High confidence) | N |
| Tests skipped — App Bug (Category F) | N |
| Tests skipped — Intentional (Category I) | N |
| Remaining low-confidence tests | N |
| Overall confidence | NN% |

## Test-by-Test Record

| TC-ID | Test title | Baseline result | Final result | Category | Changes made | Confidence |
|-------|-----------|-----------------|-------------|----------|-------------|-----------|
| TC-... | ... | ❌ fail | ✅ pass | A | Fixed selector `#old` → `getByRole('button', { name: '...' })` | ✅ High |

## App Bugs Filed

| DEF-ID | TC-ID | Description | Filed date | ADO WI (if created) |
|--------|-------|-------------|-----------|---------------------|

## Spec Defects (Category G)

| TC-ID | Issue | Recommended `05-test-scenarios.md` update |
|-------|-------|------------------------------------------|

## Coverage Gaps Identified (do not fix in this stage)

- {TC-ID}: test mapped in COVERAGE-MAPPING.md but `.spec.ts` function not found
- ...

## Decisions Log

Chronological record of non-trivial decisions made during stabilization:

- YYYY-MM-DD: Classified TC-XXX failure as Category F after verifying the save endpoint
  returns 500 on duplicate RUTs. App bug, not test bug. DEF-001 filed.
- ...
```

---

## Step 8 — Update Upstream Artifacts

After completing STABILIZATION-REPORT.md:

1. **If any Category G issues were found** (TC Mismatch): update `05-test-scenarios.md`
   with the corrected acceptance criteria. Note the change with `[REVISED - {YYYY-MM-DD}]`.

2. **If any Category F issues were found** (App Bug): create defect files in
   `qa/{module-key}/{submodule-key}/06-defects/open/DEF-{NNN}.md` for each bug filed.

3. **Update `COVERAGE-MAPPING.md`**: set the `Status` column for each TC:
   - `Automated` — test is ✅ High confidence
   - `Skipped-Defect` — test is skipped via `test.skip()` with a DEF reference
   - `Skipped-Infra` — test is skipped due to environment limitation
   - `Manual` — TC is intentionally not automated

4. **Update session-summary.md** for the submodule: mark Stage 3.5 as ✅ Complete and
   record the overall confidence percentage.