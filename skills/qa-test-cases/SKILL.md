---
name: qa-test-cases
description: >
  Stage 4 of the QA pipeline. Generates individual test case documents from
  approved specifications and the test plan. Produces TC-{ID}.md files with
  preconditions, steps, and expected results.
  Use when asked to write test cases, create TCs, expand scenarios into steps,
  document test procedures, or generate TC-{ID} files.
  Requires existing specs (Stage 2) and, ideally, a test plan (Stage 3).
---

# QA Skill: Test Case Generation (Stage 4 of 6)

**Stage**: 4 — Test Cases  
**Prerequisite**: Submodule specs exist (Stage 2). Test plan is optional but strongly recommended.  
**Output**: `qa/03-test-cases/automated/TC-{ID}.md` (one file per TC)  
**Next stage**: Stage 5 — Automation (`qa-automation`)

> **Pipeline rule**: TC IDs must be unique across the module. Never reuse a TC ID.

---

## Inputs Required

1. `qa/01-specifications/{module}/05-test-scenarios.md` — source scenarios to expand
2. Test plan (if available) — defines priority and which scenarios are in scope
3. Module TC-ID range prefix (e.g., `PROV` → `TC-PROV-001`)

---

## Process

### Step 1 — Audit existing TCs

Check `qa/03-test-cases/automated/` for existing TC files in this module. Note:
- Highest existing TC number (to continue sequence from next number)
- Any `PENDING-CODE` TCs (skip automation loop; flag for manual follow-up)
- Any TCs for scenarios already documented (do not duplicate)

### Step 2 — Map scenarios to TC IDs

For each scenario in `05-test-scenarios.md`:
- Assign sequential TC ID: `TC-{PREFIX}-{NNN}` (zero-padded to 3 digits)
- Annotate with priority and automation feasibility from test plan (if available)
- Skip scenarios marked with `BLOCKED-PERMISSIONS` or `NOT-AUTOMATABLE` — generate TC shells only

### Step 3 — Write TC documents

Full template: `references/test-case-template.md`

Each TC file must include:
- **ID** and **Title**
- **Priority** (P0/P1/P2/P3)
- **Automation feasibility** (fully / partially / not)
- **Preconditions** (setup state + test data reference)
- **Steps** (numbered, action + input + expected result per step)
- **Postconditions** (cleanup or state left after TC)
- **Tags** (e.g., `smoke`, `regression`, `happy-path`)

### Step 4 — Quality gates

Before saving each TC:
- Every step has an expected result — no steps with "verify it works"
- Test data references a named fixture or `qa/01-specifications/{module}/04-test-data.md`
- For CRUD TCs: steps cover create → verify → update → verify → delete → verify
- Preconditions do not duplicate setup that belongs in a shared fixture

### Step 5 — Update index

Create or update `qa/03-test-cases/automated/{module}-index.md`:
- Table: TC ID | Title | Priority | Feasibility | Spec reference

---

## Key Rules

| Rule | Correct | Wrong |
|---|---|---|
| TC isolation | Each TC is independent | TCs depend on prior TC's data |
| Step granularity | One action + one assertion per step | Multi-action steps |
| Data hygiene | Named fixtures or spec data | Hardcoded values in steps |
| ID stability | Never re-number existing IDs | Renaming breaks ADO links |

---

## Outputs

- `qa/03-test-cases/automated/TC-{ID}.md` (one per scenario)
- `qa/03-test-cases/automated/{module}-index.md`
