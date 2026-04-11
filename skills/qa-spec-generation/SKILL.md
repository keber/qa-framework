---
name: qa-spec-generation
description: >
  Stage 2 of the QA pipeline. Generates or updates the 6-file specification set
  (00-inventory, 01-business-rules, 02-workflows, 03-roles-permissions, 04-test-data,
  05-test-scenarios) for a module submodule. Use when asked to write specs, generate
  test scenarios, document business rules, create a test case table, or produce the
  QA specification for a feature. Requires completed module analysis (Stage 1).
---

# QA Skill: Specification Generation (Stage 2 of 6)

**Stage**: 2 — Specification Generation  
**Prerequisite**: `00-inventory.md` must exist (Stage 1 complete)  
**Output**: Complete 6-file spec set under `qa/01-specifications/module-{name}/submodule-{name}/`  
**Next stage**: Stage 3 — Test Plan (`qa-test-plan`)

> **Pipeline rule**: Do not generate specs for features marked `PENDING-CODE` in the inventory.
> Do not create TCs without having observed or been given the behavior being tested.

---

## Inputs Required

1. Module exploration notes or existing `00-inventory.md`
2. Module code from `qa/00-standards/naming-conventions.md`
3. Submodule name and kebab-case directory name
4. QA environment observations (what was actually seen in the UI)

---

## File Generation Rules

Generate or update each file following the formats in `references/spec-file-formats.md`.

### `00-inventory.md`
- Header block: module/submodule codes, primary URL, status, last updated date
- UI element table: name, type, required, notes (validation rule)
- API endpoint table: method, path, purpose
- **Never include**: credentials, personal data, real user IDs

### `01-business-rules.md`
- Format: `RN-{MODULE}-{NNN}` with type, trigger, behavior, error message (exact UI text)
- **Rule sources**: every required field → 1 RN; every unique constraint → 1 RN; every state transition → 1 RN; every role restriction → 1 RN
- Minimum 5 rules per submodule; typical 8–15

### `02-workflows.md`
- Format: `FL-{MODULE}-{NNN}` with actor, trigger, precondition, ASCII/Mermaid flow diagram, postcondition
- Must cover: primary happy path + rejection/cancellation + error path

### `03-roles-permissions.md`
- Role × feature access matrix: ✅ / ❌ / ⚠️ (limited)
- Test user reference table: role name + env var names only (never actual credentials)

### `04-test-data.md`
- Prerequisites table (data that must exist before tests run)
- Data shapes per key scenario (reference env vars for credentials)
- EXEC_IDX pattern for unique dynamic values
- Data isolation rules (each test operates on its own data)

### `05-test-scenarios.md`
- Summary table at top (total TCs by priority and type)
- TC format: `TC-{MODULE}-{SUBMODULE}-{NNN}` with priority, type, origin, automation feasibility, preconditions, steps, expected result
- **Target**: 50–85 TCs per submodule
- **Mandatory coverage categories** (≥1 TC each where applicable):
  - Access: unauthenticated user; role without permission
  - Happy path: primary workflow end-to-end
  - Negative: required field missing; duplicate; invalid format
  - State transitions
  - Export/download (if feature exists)
  - Pagination/search (if feature exists)

Full format templates: `references/spec-file-formats.md`

---

## Anti-Patterns to Avoid

| Anti-pattern | Correct approach |
|---|---|
| TC for a feature not in QA env | Mark as `PENDING-CODE`; do not write test steps |
| Real credentials in any TC step | Use env var references only |
| "Verify system works correctly" as expected result | Write observable, measurable expected result |
| 100+ TCs by copy-pasting near-identical variations | Merge cases; use parameterization |
| TC written without observing the actual behavior | Mark as `PENDING-CODE` until verified |

---

## Outputs

- 6 spec files per submodule in `qa/01-specifications/module-{name}/submodule-{name}/`
- Module `README.md` updated with submodule TC count
- `qa/README.md` module status updated
