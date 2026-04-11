---
name: qa-maintenance
description: >
  Stage 6 of the QA pipeline. Updates QA artifacts after application changes.
  Keeps specs, test cases, and automation in sync with the product.
  Use when asked to update specs after a change, maintain tests after a feature
  change, sync QA with a new release, update a spec after a bug fix, or
  perform QA maintenance after a sprint.
  Requires a delivered application change to be the trigger.
---

# QA Skill: Maintenance (Stage 6 of 6)

**Stage**: 6 — Maintenance  
**Prerequisite**: An application change (bug fix, feature change, new requirement) has been delivered  
**Output**: Updated specs, TCs, and automation aligned with the new application behavior  
**Cycle**: Returns to Stage 2 (spec update) → Stage 4 (TC update) → Stage 5 (automation update) as needed

> **Rule**: Never update specs to match an incorrect application behavior. Specs define correct behavior; automation reflects specs. If the app is wrong, file a defect, don't update the spec.

---

## Inputs Required

1. Description of the change — which submodule, what changed, and why
2. `qa/01-specifications/{module}/` — specs affected by the change
3. `qa/07-automation/e2e/{module}/` — automation affected by the change
4. Optionally: ADO work item or defect report describing the change

---

## Process

### Step 1 — Identify affected artifacts

For the delivered change, identify:
- Which spec files reference the changed behavior (search for affected term/field/flow)
- Which TCs exercise that behavior
- Which automation files implement those TCs
- Whether any test data in `04-test-data.md` is affected

### Step 2 — Update specs first

Update spec files before touching automation. Spec update rules:

| Situation | Action |
|---|---|
| UI label changed | Update `02-workflows.md` step text |
| Business rule changed | Update `01-business-rules.md` rule + affected scenarios in `05-test-scenarios.md` |
| New required field added | Update `02-workflows.md` + `04-test-data.md` + `05-test-scenarios.md` |
| Field removed | Mark TC as `OBSOLETE-SCENARIO` in `05-test-scenarios.md`, delete corresponding TC file |
| Permission change | Update `03-roles-permissions.md` |
| Flow reordered | Update `02-workflows.md` with new step sequence |

Detailed rules: `references/update-rules.md`

### Step 3 — Update TCs

After specs are updated:
- Update step text in affected `TC-*.md` files
- If a TC no longer applies: mark as `[OBSOLETE]` in the index, do not delete the file
- If a new scenario added to specs: generate new TC following Stage 4

### Step 4 — Update automation

After TCs are updated:
- Update locators for changed UI elements
- Update assertions for changed business rules
- Remove or skip automation for `OBSOLETE-SCENARIO` TCs
- Run updated spec file locally to confirm passing before committing

Automation update rules: `references/update-rules.md`

### Step 5 — Bump spec version and log change

In the spec file's YAML frontmatter (or header block):
```
version: {incremented}
last-updated: {date}
change-summary: {one-line description of what changed}
```

### Step 6 — Update README and close session

- Update `qa/README.md` module row (spec version, TC count if changed, automation status)
- Update `AGENT-NEXT-STEPS.md`:
  - Remove completed items from the active sprint checklist
  - If all TCs passing: trigger Module Completion Ritual (move sprint to history, trim file)
- Generate session summary in `qa/memory/` if significant changes were made

---

## Key Rules

| Rule | Correct | Wrong |
|---|---|---|
| Spec is ground truth | Update spec first, then tests | Fix test to match wrong behavior |
| Obsolete TCs | Mark as OBSOLETE, keep file | Delete TC files |
| Scope discipline | Only touch artifacts linked to the change | Rewrite unrelated specs "while you're there" |
| Version tracking | Bump version + log change summary | Silently update spec content |

---

## Outputs

- Updated `qa/01-specifications/{module}/*.md` files
- Updated `qa/03-test-cases/automated/TC-*.md` files
- Updated `qa/07-automation/e2e/{module}/*.spec.ts`
- Updated `qa/README.md`
- Updated `AGENT-NEXT-STEPS.md` (or sprint moved to history if complete)
