---
name: qa-test-plan
description: >
  Stage 3 of the QA pipeline. Generates a test plan document from completed
  submodule specifications. Defines scope, priority distribution, automation
  feasibility, ADO mapping, and TC selection for a sprint or release.
  Use when asked to create a test plan, define test scope, plan a sprint,
  prioritize test cases, or decide what to automate vs test manually.
  Requires completed specs (Stage 2).
---

# QA Skill: Test Plan Generation (Stage 3 of 6)

**Stage**: 3 — Test Plan  
**Prerequisite**: `05-test-scenarios.md` must exist for all in-scope submodules (Stage 2 complete)  
**Output**: `qa/02-test-plans/automated/{module}-test-plan.md`  
**Next stage**: Stage 4 — Test Cases (`qa-test-cases`) or Stage 5 — Automation (`qa-automation`)

> **Pipeline rule**: Do not automate TCs that are not in an approved or active test plan.

---

## Inputs Required

1. `qa/01-specifications/module-{name}/` — all submodule specs
2. Scope definition — which submodules are in this test plan (ask the user if not given)
3. Priority guidance (from team or implied by sprint scope)

---

## Process

### Step 1 — Collect TC inventory

For each in-scope submodule, read `05-test-scenarios.md` and aggregate:
- Total TC count by priority (P0/P1/P2/P3)
- TC count by automation feasibility (fully / partially / not automatable)
- Any TCs marked `BLOCKED-PERMISSIONS` or `PENDING-CODE` (these go in the exclusion list)

### Step 2 — Apply priority rules

Use the priority decision tree (see `references/priority-and-feasibility.md`) to assign or validate priorities. Key rules:

- **P0**: primary happy path; show-stopper risk; critical data corruption
- **P1**: common negative scenarios; cross-module dependencies; state machine transitions
- **P2**: secondary features (export, pagination, search)
- **P3**: edge cases, cosmetic, rare scenarios

### Step 3 — Apply automation feasibility rules

- **Fully automatable**: deterministic, observable via browser, no external system dependency
- **Partially automatable**: some result requires human inspection OR external system can be mocked
- **Not automatable**: physical access required; inherently non-deterministic; irreversible QA side effects; BLOCKED-PERMISSIONS

### Step 4 — Write the test plan document

Full document template: `references/test-plan-template.md`

Required sections:
1. Objective
2. Scope (in/out)
3. Automation feasibility analysis table (per submodule)
4. Priority distribution table
5. TC selection suites (P0 suite, P1 suite)
6. Azure DevOps mapping (if ADO enabled)
7. Test environment
8. Risks and assumptions
9. Excluded TCs (with reason)
10. Execution schedule

### Step 5 — Update status

- Update `qa/README.md` module row (plan status → ✅)
- If ADO enabled: stub the ADO Plan ID field for Step 6 (ADO integration)

---

## Outputs

- `qa/02-test-plans/automated/{module}-test-plan.md`
- `qa/README.md` plan status updated
