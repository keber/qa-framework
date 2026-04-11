# Agent Instructions: Test Case Generation

> ⚠️ **DEPRECATED**: This file is superseded by `.github/skills/qa-test-cases/SKILL.md`.
> Kept as reference during the transition period. Do not update this file.

**File**: `agent-instructions/03-test-case-generation.md`  
**Purpose**: Instructions for writing detailed, standalone test case documents from approved spec scenarios.

---

## When to use

- When a TC from `05-test-scenarios.md` needs more detail than the table row provides
- When writing complex multi-step TCs that require dedicated documentation
- When preparing TCs for manual testers who need step-by-step instructions

---

## Test Case Template

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

{1-2 sentences: what this test case verifies and why it matters}

---

## Preconditions

1. User is logged in as **{role}**
2. The following data exists in the QA environment:
   - {item 1}: {description}
   - {item 2}: {description}
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
| 1 | Navigate to {URL} | {page loads, specific element visible} |
| 2 | Click {element description} | {modal opens / form appears / etc.} |
| 3 | Fill {field} with {value} | {field accepts input} |
| 4 | Click {submit/save/confirm button} | {success message / redirect / state change} |
| 5 | Verify {observable outcome} | {specific text, element, state} |

---

## Expected Results

**Final state**: {what the system should look like after all steps are complete}

**Verification points**:
- [ ] {verification 1}: {element} should {state}
- [ ] {verification 2}: {element} should contain {text}
- [ ] {verification 3}: page/modal should transition to {expected state}

---

## Known Issues / Related Defects

| Issue | DEF-ID / ADO WI | Status | Impact on this TC |
|-------|----------------|--------|------------------|
| {description} | DEF-NNN | Open | TC skipped until resolved |

---

## Evidence

{Link to screenshot or video from execution, if available}

---

## Automation Notes

```typescript
// Playwright selector for key element (discovered during implementation)
// page.locator('{selector}')

// Key assertion
// await expect(page.locator('{selector}')).toHaveText('{expected text}');
```

---

## Changelog

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | YYYY-MM-DD | {author} | Initial creation |
```

---

## Rules for TC Content Quality

### Write measurable expected results

❌ BAD: "The system should work correctly"  
✅ GOOD: "A success toast message 'Record saved' appears and the datatable row count increases by 1"

❌ BAD: "The form validates the input"  
✅ GOOD: "A red validation message 'This field is required' appears below the Name field"

### Write observable steps

❌ BAD: "Add a new record with valid data"  
✅ GOOD: "Click the 'New' button. Fill 'Name' with 'Test-{EXEC_IDX}'. Click 'Save'."

### Link to defects explicitly

If a TC is skipped due to a bug:  
✅ GOOD: "Step 4 — SKIPPED: DEF-001 (ADO #21944). The switch defaults to OFF when it should be ON. Reactivate after fix."

### Priority guidelines recap

| Priority | Use when |
|---|---|
| P0 | Core feature is unusable without this working |
| P1 | Major functionality gap if this fails |
| P2 | Minor functionality gap, workaround exists |
| P3 | Edge case, cosmetic, or rare scenario |
