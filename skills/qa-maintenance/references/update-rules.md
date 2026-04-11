# Reference: Spec and Automation Update Rules

> Loaded by `skills/qa-maintenance/` when performing post-change spec and automation updates.

---

## Spec Update Rules by Change Type

### New field added to a form

1. Add field row to `00-inventory.md` UI Elements table
2. Add business rule to `01-business-rules.md` if the field has validation: `RN-{MODULE}-{next-number}`
3. Add TCs to `05-test-scenarios.md`:
   - Happy path TC with new field populated
   - Required validation TC (if the field is required)
   - Any new business rule violation TC

### Field removed from UI

1. Mark row in `00-inventory.md` as `[REMOVED - {YYYY-MM-DD}]` — do NOT delete the row
2. Mark the related business rule in `01-business-rules.md` as `[DEPRECATED - {YYYY-MM-DD}]`
3. Mark related TCs in `05-test-scenarios.md` as `[DEPRECATED]` for traceability
4. Update or skip automation tests that reference the removed element's selector

### Workflow changed

1. Update `02-workflows.md` with the new flow diagram
2. Mark the old version as `[PREVIOUS - {YYYY-MM-DD}]` inside the same file (keep for reference)
3. Review all TCs that test the affected steps — update expected results in `05-test-scenarios.md`

### New submodule added

Follow the full module analysis process: `skills/qa-module-analysis/`.

### Defect resolved

1. Find all `test.skip()` calls that reference the DEF-ID or ADO WI number
2. Remove the `test.skip()` wrapper
3. If the spec assertion was adapted to document the bug (e.g., `toBeFalsy()` for a wrong default), restore the correct assertion
4. Run the test at least 2 times with different `EXEC_IDX` values to confirm stability
5. Update `qa/06-defects/open/DEF-{NNN}.md` status to Resolved; move file to `06-defects/resolved/`

---

## Automation Update Rules

### Selectors changed (redesign or framework update)

1. Locate the spec file or page object containing the old selector
2. Update the selector — prefer `getByRole`, `getByLabel`, `getByTestId`
3. Run the affected test 2+ times to confirm stability
4. Add an entry to the correction log at top of the spec file:

```typescript
/* CORRECTIONS
 * YYYY-MM-DD: Updated selector for {element} from '#old-id' to getByRole('button', { name: '...' })
 */
```

### New test suite needed

Follow `skills/qa-automation/` for the new suite.  
Update `COVERAGE-MAPPING.md` with new TC rows.

### Test became flaky after app update

5-layer debugging methodology:
1. **Environment**: is QA env stable? Can you log in manually?
2. **Timeout**: did an operation become slower? Increase `actionTimeout` if justified
3. **Data**: did a seed or precondition change? Review `beforeAll` provisioning
4. **Selector**: did the element structure change? Inspect with Playwright UI mode
5. **System**: is this a real defect? File with DEF reference and skip the test

---

## Spec Version Changelog Block

Add to the bottom of each updated spec file:

```markdown
## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | YYYY-MM-DD | Initial creation |
| 1.1 | YYYY-MM-DD | Added RN-{MODULE}-{NNN}: {rule title}. TC count: N → M |
| 1.2 | YYYY-MM-DD | Removed field {name} (deprecated) |
```

---

## Session Summary Template

Create at: `qa/SESSION-SUMMARY-{YYYY-MM-DD}-maintenance.md`

```markdown
# Maintenance Session — {YYYY-MM-DD}

## Change trigger
{Brief description of the application change that triggered this session}

## Artifacts updated
| File | Type of change |
|------|---------------|
| qa/01-specifications/{module}/{submodule}/00-inventory.md | Added field {name} |
| qa/01-specifications/{module}/{submodule}/05-test-scenarios.md | Added TCs {IDs} |

## TC changes
- New TCs: {IDs} (+N total)
- Deprecated TCs: {IDs} (-N total)
- Net TC count: {module} → {N}

## Tests reactivated
- {TC-ID}: removed test.skip() — DEF-{NNN} resolved

## Tests newly skipped
- {TC-ID}: test.skip() added — DEF-{NNN} filed for {bug description}
```
