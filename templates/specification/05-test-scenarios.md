# Test Scenarios — {{MODULE_NAME}}: {{SUBMODULE_NAME}}

> **Module code**: {{MODULE_CODE}} | **Submodule code**: {{SUBMODULE_CODE}}  
> **Last updated**: YYYY-MM-DD

---

## Summary

| Priority | Total | Automated | Manual | Pending |
|----------|-------|-----------|--------|---------|
| P0 | 0 | 0 | 0 | 0 |
| P1 | 0 | 0 | 0 | 0 |
| P2 | 0 | 0 | 0 | 0 |
| P3 | 0 | 0 | 0 | 0 |
| **Total** | **0** | **0** | **0** | **0** |

---

## Test Cases

---

### TC-{{M}}-{{S}}-001: Unauthenticated access redirects to login

| Field | Value |
|-------|-------|
| Priority | P0 |
| Type | Security |
| Origin | UI-OBSERVED |
| Automation | Yes |

**Preconditions**: User is NOT logged in.

**Steps**:
1. Navigate directly to `{{QA_BASE_URL}}/{{SUBMODULE_PATH}}`

**Expected result**: Redirected to login page. `{{SUBMODULE_PATH}}` URL is not accessible.

---

### TC-{{M}}-{{S}}-002: Role without permission cannot access submodule

| Field | Value |
|-------|-------|
| Priority | P0 |
| Type | Security |
| Origin | UI-OBSERVED |
| Automation | Yes |

**Preconditions**: Logged in as `{{ROLE_WITHOUT_PERMISSION}}`.

**Steps**:
1. Navigate to `{{QA_BASE_URL}}/{{SUBMODULE_PATH}}`

**Expected result**: Permission error displayed OR menu item not visible OR redirect to home.

---

### TC-{{M}}-{{S}}-003: List loads correctly for authorized user

| Field | Value |
|-------|-------|
| Priority | P0 |
| Type | Functional |
| Origin | UI-OBSERVED |
| Automation | Yes |

**Preconditions**: Logged in as `{{AUTHORIZED_ROLE}}`. At least 1 record exists.

**Steps**:
1. Navigate to `{{QA_BASE_URL}}/{{SUBMODULE_PATH}}`

**Expected result**: Table/grid displays records. Column headers visible. Pagination controls present.

---

### TC-{{M}}-{{S}}-004: Create new record — happy path

| Field | Value |
|-------|-------|
| Priority | P0 |
| Type | Functional |
| Origin | UI-OBSERVED |
| Automation | Yes |

**Test data**:
- Name: `Test-{EXEC_IDX}` (unique per run)
- other fields: valid values per 04-test-data.md

**Steps**:
1. Click 'New' / 'Create' button
2. Fill all required fields with valid data
3. Click 'Save' / 'Submit'

**Expected result**: Success message appears. New record visible in the list.

---

### TC-{{M}}-{{S}}-005: Required field validation — name empty

| Field | Value |
|-------|-------|
| Priority | P1 |
| Type | Negative |
| Origin | UI-OBSERVED |
| Automation | Yes |

**Steps**:
1. Click 'New' / 'Create' button
2. Leave required field `{{FIELD_NAME}}` empty
3. Click 'Save' / 'Submit'

**Expected result**: Validation error shown near the field: "{{exact error message text}}"

---

### TC-{{M}}-{{S}}-006: Duplicate rejection

| Field | Value |
|-------|-------|
| Priority | P1 |
| Type | Negative |
| Origin | UI-OBSERVED |
| Automation | Yes |

**Preconditions**: A record with name "{{duplicate-value}}" already exists.

**Steps**:
1. Click 'New' / 'Create' button
2. Enter the same name as an existing record
3. Click 'Save' / 'Submit'

**Expected result**: System rejects with error: "{{exact duplicate error message}}"

---

### TC-{{M}}-{{S}}-007: Edit existing record

| Field | Value |
|-------|-------|
| Priority | P1 |
| Type | Functional |
| Origin | UI-OBSERVED |
| Automation | Yes |

**Preconditions**: At least 1 record exists.

**Steps**:
1. Click 'Edit' on an existing record
2. Modify `{{FIELD_NAME}}` to a new valid value
3. Click 'Save'

**Expected result**: Success message. Record in list shows updated value.

---

### TC-{{M}}-{{S}}-008: Delete / deactivate record

| Field | Value |
|-------|-------|
| Priority | P1 |
| Type | Functional |
| Origin | UI-OBSERVED |
| Automation | Partial |

**Preconditions**: At least 1 deletable record exists.

**Steps**:
1. Click 'Delete' / 'Deactivate' on an existing record
2. Confirm the action in the confirmation dialog

**Expected result**: Record is removed from active list or marked as inactive.

---

### TC-{{M}}-{{S}}-009: Export to Excel / CSV

| Field | Value |
|-------|-------|
| Priority | P2 |
| Type | Functional |
| Origin | UI-OBSERVED |
| Automation | Partial |

**Steps**:
1. Navigate to list view
2. Click 'Export' button

**Expected result**: File download initiates. File is non-empty.

---

### TC-{{M}}-{{S}}-010: Search / filter works

| Field | Value |
|-------|-------|
| Priority | P2 |
| Type | Functional |
| Origin | UI-OBSERVED |
| Automation | Yes |

**Steps**:
1. Navigate to list view
2. Type a known value in the search input
3. Wait for filter to apply

**Expected result**: Only records matching the search term are shown.

---

## Traceability

| TC ID | Business Rules | Workflow |
|-------|---------------|---------|
| TC-{{M}}-{{S}}-001 | — | — |
| TC-{{M}}-{{S}}-004 | RN-{{M}}-001 | FL-{{M}}-001 |
| TC-{{M}}-{{S}}-005 | RN-{{M}}-001 | — |

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | YYYY-MM-DD | Initial creation (N TCs) |
