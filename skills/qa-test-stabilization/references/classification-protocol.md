# Reference: Failure Classification Protocol

> Loaded by `skills/qa-test-stabilization/` for failure diagnosis and reporting.

---

## Failure Categories

| Category | Definition | Correct action |
|----------|-----------|----------------|
| **A — Wrong selector** | Locator no longer matches the UI element | Fix selector; prefer `getByRole`, `getByLabel`, `getByTestId` |
| **B — Wrong assertion** | Assertion doesn't match TC acceptance criterion | Rewrite assertion to match spec |
| **C — Wrong flow** | Test steps don't reflect the user flow in the TC | Rewrite steps to match TC |
| **D — Fragile timing** | Intermittent failure due to missing `await`, race condition, or missing `waitFor` | Add proper async handling; never use `waitForTimeout` |
| **E — Incorrect data** | Data malformed, not unique, or conflicts with QA environment state | Fix data generation or `beforeAll` provisioning |
| **F — App Bug** | Test is correct; application doesn't behave as specified | Do NOT fix test; file defect; skip with DEF reference |
| **G — TC Mismatch** | TC acceptance criterion is ambiguous or wrong vs actual behavior | Do NOT fix test or app; update `05-test-scenarios.md` |
| **H — Infra/Environment** | Failure due to env unavailability, network, or credentials | Retry in clean environment before classifying further |
| **I — Intentional skip** | Test skipped for known defect or pending feature | Verify skip reason still valid; update defect reference if needed |

---

## Decision Protocol

```
Are test steps and assertion derived correctly from 05-test-scenarios.md?
  No → Category G (fix the spec, not the test)
  Yes ↓
Does the application behave as the TC acceptance criterion describes?
  No → Category F (file defect; skip test with DEF reference)
  Yes ↓
Is the failure deterministic (every run)?
  No → Category D or H (timing or environment issue)
  Yes ↓
Is the failure caused by selector, assertion, flow, or data issue?
  → Category A, B, C, or E (fix the test code)
```

**Fix order**: E → A → C → B → D (data masks selectors; flow masks assertions)

---

## False Positive Check

For each **passing** test, perform a negation check:

1. Temporarily change the assertion to assert the opposite
2. Run the test — if it still passes, the original assertion is not evaluating the element
3. Restore the original assertion

```typescript
// Original
await expect(page.locator('.toast')).toHaveText('Guardado exitosamente');
// Negation check (temporary — revert after)
await expect(page.locator('.toast')).toHaveText('TEXTO_QUE_NO_EXISTE');
// If this passes → false positive detected
```

---

## Confidence Scoring

| Level | Criteria |
|-------|---------|
| ✅ High (≥90%) | Passed negation check AND matches TC acceptance criterion exactly |
| ⚠️ Medium (70–89%) | Consistently passing; trace reviewed; negation check pending |
| ❌ Low (<70%) | Intermittent, unclassified, or negation check not done |

**Exit criterion**: All tests ✅ High or legitimately skipped with defect reference.

---

## STABILIZATION-REPORT Template

Create at: `qa/07-automation/e2e/tests/{module}/{STABILIZATION-REPORT-YYYY-MM-DD.md}`

```markdown
# Stabilization Report — {MODULE} > {SUBMODULE}

**Date**: YYYY-MM-DD  
**Sprint**: {sprint label}  
**Spec reference**: `qa/01-specifications/{module}/{submodule}/05-test-scenarios.md`

## Summary

| Metric | Value |
|--------|-------|
| Tests evaluated | N |
| Stabilized (✅ High confidence) | N |
| Skipped — App Bug (Category F) | N |
| Skipped — Intentional (Category I) | N |
| Remaining low-confidence | N |
| Overall confidence | NN% |

## Test-by-Test Record

| TC-ID | Test title | Baseline | Final | Category | Changes made | Confidence |
|-------|-----------|----------|-------|----------|-------------|-----------|
| TC-... | ... | ❌ fail | ✅ pass | A | Selector `#old` → `getByRole('button', { name: '...' })` | ✅ High |

## App Bugs Filed (Category F)

| DEF-ID | TC-ID | Description | ADO WI |
|--------|-------|-------------|--------|

## Spec Defects (Category G)

| TC-ID | Issue | Recommended 05-test-scenarios.md update |
|-------|-------|----------------------------------------|

## Coverage Gaps (note only — do not fix in this stage)

- TC-XXX: mapped in COVERAGE-MAPPING.md but spec function not found

## Decisions Log

- YYYY-MM-DD: Classified TC-XXX as Category F — save endpoint returns 500 on duplicate. DEF-001 filed.
```

---

## EXEC_IDX Collision Note

Two runs within the same 60-second window produce identical `EXEC_IDX` values. For fields requiring guaranteed uniqueness:

```typescript
const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;
const RUN_SALT = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
const uniqueName = `Test-${EXEC_IDX}-${RUN_SALT}`;
```

---

## Post-Stabilization Artifact Updates

1. **Category G found** → update `05-test-scenarios.md` with `[REVISED - {date}]`
2. **Category F found** → create `qa/06-defects/open/DEF-{NNN}.md` per bug
3. **COVERAGE-MAPPING.md** → update Status column for all TCs:
   - `Automated` — ✅ High confidence
   - `Skipped-Defect` — skipped with DEF reference
   - `Skipped-Infra` — environment limitation
   - `Manual` — intentionally not automated
