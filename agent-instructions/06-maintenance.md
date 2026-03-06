# Agent Instructions: Maintenance and Updates

**File**: `agent-instructions/06-maintenance.md`  
**Purpose**: Instructions for updating QA artifacts after application code changes.

---

## When to use

- A developer reports a feature change or new feature in a module
- A sprint delivers changes to an already-analyzed module
- A defect is resolved and related `test.skip()` calls need to be reactivated
- The QA environment is updated and existing specs need to be refreshed

---

## Step 1: Identify What Changed

Gather from the developer or ticket:
- Which module/submodule was changed?
- Was it a new feature, a modification, or a bug fix?
- Are there new routes, fields, or API endpoints?
- Were any existing behaviors removed or changed?

If the change scope is unclear, navigate to the affected module in the QA environment and compare against the existing `00-inventory.md`.

---

## Step 2: Spec Update Rules

### A new field was added to a form

1. Add the field to `00-inventory.md` under UI Elements table
2. If the field has validation: add a business rule to `01-business-rules.md` (`RN-{MODULE}-{next-number}`)
3. Add TCs to `05-test-scenarios.md`:
   - TC for happy path with the new field
   - TC for required validation (if applicable)
   - TC for any new business rule

### A field was removed from the UI

1. Mark the field in `00-inventory.md` as `[REMOVED - {YYYY-MM-DD}]` — do not delete the row
2. If automation tests reference the field selector: update or skip them
3. If a business rule only applied to that field: mark as `[DEPRECATED - {YYYY-MM-DD}]`
4. Leave TCs in `05-test-scenarios.md` marked as `[DEPRECATED]` for traceability

### A workflow was changed

1. Update `02-workflows.md` with the new flow
2. Mark the old version as `[PREVIOUS - {YYYY-MM-DD}]`
3. Review all TCs that test the affected steps
4. Update expected results in `05-test-scenarios.md`

### A new submodule was added

Follow the full module analysis process in `00-module-analysis.md`.

### A defect was fixed

1. Find all `test.skip()` calls that reference the DEF-ID or ADO WI
2. Remove the `test.skip()` wrapper
3. Run the test at least 2 times with different EXEC_IDX values to confirm stability
4. Update `06-defects/DEF-{NNN}.md` (or ADO WI) status to Resolved
5. If the spec assertion was adapted to document the bug (e.g., `toBeFalsy()` for a wrong default), restore the correct assertion

---

## Step 3: Automation Update Rules

### Selectors changed (redesign, framework update)

1. Locate the POM file or spec file that contains the old selector
2. Check `CORRECTIONS` block at top of spec file (convention for documenting selector audits)
3. Update the selector
4. Run the affected test 2+ times to confirm the new selector is stable
5. Add an entry to the `CORRECTIONS` block noting the change and date

### New test suite needed

Follow `04-automation-generation.md` for the new suite.  
Update `COVERAGE-MAPPING.md` with the new TCs.

### Test became flaky after app update

Use the 5-layer debugging methodology:
1. Environment: is QA env stable?
2. Timeout: did an operation become slower?
3. Data: did a seed or precondition change?
4. Selector: did the element structure change?
5. System: is this a real defect?

---

## Step 4: Version the Spec

At the bottom of each updated spec file, add to the changelog:

```markdown
## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | YYYY-MM-DD | Initial creation |
| 1.1 | YYYY-MM-DD | Added RN-{MODULE}-{NNN}: {rule title}. TC count: N → M |
| 1.2 | YYYY-MM-DD | Removed field {name} from UI inventory (deprecated) |
```

---

## Step 5: Update qa/README.md

After every maintenance session, update the master index:
- TC count (if changed)
- Automation status (if changed)
- Last updated date for the module

---

## Step 6: Write a Session Summary

Create `qa/SESSION-SUMMARY-{YYYY-MM-DD}-maintenance.md` documenting:
- What changed
- Which files were updated
- Any new TCs or deprecated TCs
- Any tests that were reactivated or newly skipped
