# Bug Report — DEF-{{NNN}}: {{Short Title}}

| Field | Value |
|-------|-------|
| Bug ID | DEF-{{NNN}} |
| Title | {{Short title (max 80 chars)}} |
| Severity | Critical / High / Medium / Low |
| Priority | P0 / P1 / P2 / P3 |
| Status | Open / In Progress / Resolved / Closed |
| Assigned to | {{Developer or "Unassigned"}} |
| Module | {{Module name}} |
| Submodule | {{Submodule name}} |
| Environment | QA ({{QA_BASE_URL}}) |
| Browser | Chromium {{version}} |
| Date reported | YYYY-MM-DD |
| ADO WI | #{ADO_WORK_ITEM_ID} (if ADO enabled) |
| Related TCs | TC-{{M}}-{{S}}-{{NNN}} |

---

## Description

{{1-2 sentences describing what the bug is and where it occurs}}

---

## Steps to Reproduce

| Step | Action |
|------|--------|
| 1 | Navigate to `{{QA_BASE_URL}}/{{path}}` as `{{role}}` |
| 2 | {{action}} |
| 3 | {{action}} |
| 4 | Observe `{{element}}` |

---

## Expected Result

{{What should happen according to business rules RN-{{M}}-{{NNN}}}}

---

## Actual Result

{{What actually happens}}

---

## Evidence

- Screenshot: `qa/07-automation/e2e/diagnosis/{{NNN}}-{{bug-slug}}.png`
- Test output: (link to execution report if captured automatically)

---

## Root Cause Analysis

{{If known: explain why this happens. If unknown: "Under investigation"}}

---

## Fix Suggestion

{{If known: describe the fix. Example: "Set IND_CORREO default to true in C# model constructor"}}

---

## Impact on Automation

| TC ID | Current test state | Impact |
|-------|-------------------|--------|
| TC-{{M}}-{{S}}-{{NNN}} | `test.skip()` added | Test will remain skipped until fix is deployed |
| TC-{{M}}-{{S}}-{{NNN}} | Assertion adjusted | `toBeFalsy()` documents buggy default |

**Test skip command added**:
```typescript
test.skip(true,
  'DEF-{{NNN}}: {{description}}. Reactivate when ADO #{{WI_ID}} is resolved.'
);
```

---

## Reactivation Instructions

When this bug is fixed:
1. Remove `test.skip()` from TC-{{M}}-{{S}}-{{NNN}} in `{{spec-file}}`
2. Restore original assertion (e.g., `toBeTruthy()`)
3. Run the test at least 2 times with different EXEC_IDX values to confirm stability
4. Move this file to `06-defects/resolved/`

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | YYYY-MM-DD | Bug reported |
| 1.1 | YYYY-MM-DD | Root cause identified |
| 1.2 | YYYY-MM-DD | Fix deployed, verified |
