# Test Case — TC-{{MODULE}}-{{SUB}}-{{NNN}}: {{Title}}

| Field | Value |
|-------|-------|
| TC-ID | TC-{{MODULE}}-{{SUB}}-{{NNN}} |
| ADO WI | #{ADO_WORK_ITEM_ID} (after inject-ado-ids.ps1) |
| Title | {{Title}} |
| Module | {{MODULE_NAME}} |
| Submodule | {{SUBMODULE_NAME}} |
| Priority | P0 / P1 / P2 / P3 |
| Type | Functional / Integration / Regression / Smoke |
| Execution | Manual / Automated / Both |
| Automation file | `qa/07-automation/e2e/{{module}}/{{submodule}}.spec.ts` (if automated) |
| Preconditions | {{List required setup — see 04-test-data.md}} |
| Author | (agent output — reviewed by human) |
| Last updated | YYYY-MM-DD |

---

## Test Steps

| # | Action | Expected Result |
|---|--------|----------------|
| 1 | Navigate to `{{QA_BASE_URL}}/{{path}}` | Login page loads with form visible |
| 2 | Log in as `{{role}}` (credentials from `.env`) | Dashboard displays; role navigation visible |
| 3 | Navigate to `{{module}} > {{submodule}}` | Grid/form renders without console errors |
| 4 | {{Action on primary element}} | {{Observable, measurable outcome}} |
| 5 | {{Confirm secondary state}} | {{Confirmation visible to end user}} |

---

## Expected Final State

- **UI**: {{What the user sees after completing all steps}}
- **Data**: {{Observable data change (record count, field value, etc.)}}
- **Notifications**: {{toastr, SweetAlert, or inline message shown (exact text if known)}}
- **Side effects**: {{Other systems/modules affected}}

---

## Test Data

| Item | Value |
|------|-------|
| User | `{{QA_USER_EMAIL}}` (role: {{ROLE}}) |
| Input field 1 | `EXEC_IDX` or `{{static-value}}` |
| Input field 2 | `{{value}}` |

> Use EXEC_IDX for fields that must be unique: `Math.floor(Date.now() / 60_000) % 100_000`

---

## Pass / Fail Criteria

**PASS**: All step assertions met AND final state matches expected.

**FAIL**: Any step assertion failed, unexpected error appeared, or final state differs.

---

## Linked Artifacts

- Spec source: `{{module}}/{{submodule}}/05-test-scenarios.md`
- Business rules: `{{module}}/{{submodule}}/01-business-rules.md §RN-{{M}}-{{NNN}}`
- Related defects: DEF-{{NNN}} (if any)

---

## Execution History

| Date | Executor | Environment | Result | Notes |
|------|----------|-------------|--------|-------|
| YYYY-MM-DD | | QA | Pass / Fail / Skip | |

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | YYYY-MM-DD | TC created |
