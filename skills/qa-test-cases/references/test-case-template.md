# Reference: Test Case Template

> Loaded by `skills/qa-test-cases/` when generating TC documents.

---

## Full TC Document Template

```markdown
# TC-{MODULE}-{SUBMODULE}-{NNN}: {TC Title}

| Field | Value |
|-------|-------|
| TC ID | TC-{MODULE}-{SUBMODULE}-{NNN} |
| Module | {Module display name} |
| Submodule | {Submodule display name} |
| Priority | P0 / P1 / P2 / P3 |
| Type | Functional / Negative / Regression / Security / Integration |
| Origin | UI-OBSERVED / PENDING-CODE / BLOCKED-PERMISSIONS |
| Observation date | YYYY-MM-DD |
| Automatable | Yes / Partial / No |
| Playwright file | (fill when automation is written) |
| Status | Draft / Approved / Automated / Deprecated |

---

## Objective

{1-2 sentences: what this TC verifies and why it matters}

---

## Preconditions

1. User is logged in as **{role}**
2. The following data exists in the QA environment:
   - {item 1}: {description}
3. {any other system state requirement}

---

## Test Data

| Field | Value |
|-------|-------|
| {field name} | {value or generation rule} |
| {field name} | Use `EXEC_IDX`-generated value for uniqueness |
| User | Credentials from `QA_USER_{ROLE}_EMAIL` env var |

---

## Steps

| Step | Action | Expected result |
|------|--------|----------------|
| 1 | Navigate to {URL} | Page loads, {element} visible |
| 2 | Click {element description} | {modal opens / form appears} |
| 3 | Fill {field} with {value} | Field accepts input |
| 4 | Click {submit button} | {success message / state change} |
| 5 | Verify {observable outcome} | {specific text or element state} |

---

## Expected Results

**Final state**: {what the system should look like after all steps complete}

**Verification points**:
- [ ] {element} should {state}
- [ ] {element} should contain {text}
- [ ] Page/modal should transition to {expected state}

---

## Known Issues / Related Defects

| Issue | DEF-ID / ADO WI | Status | Impact on this TC |
|-------|----------------|--------|------------------|
| {description} | DEF-NNN | Open | TC skipped until resolved |

---

## Automation Notes

```typescript
// Key Playwright selector
// page.locator('{selector}')

// Key assertion
// await expect(page.locator('{selector}')).toHaveText('{expected}');
```

---

## Changelog

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | YYYY-MM-DD | {author} | Initial creation |
```

---

## Module Index Template

Create at: `qa/03-test-cases/automated/{module}-index.md`

```markdown
# TC Index — {Module Display Name}

| TC ID | Title | Priority | Feasibility | Spec reference |
|-------|-------|----------|-------------|---------------|
| TC-{M}-{S}-001 | {title} | P0 | Yes | 05-test-scenarios.md#{anchor} |
```

---

## Content Quality Rules

### Measurable expected results

❌ `The system should work correctly`  
✅ `A toast message 'Record saved' appears and the datatable row count increases by 1`

❌ `The form validates the input`  
✅ `A red validation message 'This field is required' appears below the Name field`

### Observable steps

❌ `Add a new record with valid data`  
✅ `Click 'New'. Fill 'Name' with 'Test-{EXEC_IDX}'. Click 'Save'.`

### Defect links

When skipping a step due to a bug:  
✅ `Step 4 — SKIPPED: DEF-001 (ADO #21944). Switch defaults to OFF. Re-enable after fix.`

### TC isolation

- Each TC is fully independent — no TC depends on state from a prior TC
- All required data is provisioned in preconditions or `beforeAll`
- CRUD TCs cover: create → verify → update → verify → delete → verify
