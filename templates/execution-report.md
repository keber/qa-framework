# Execution Report — {{MODULE_NAME}}

**Report ID**: EXEC-{{MODULE}}-{{YYYYMMDD}}-{{NNN}}
**Sprint / Release**: Sprint {{NNN}}
**Execution type**: Automated / Manual / Mixed
**Executor**: (agent name or analyst name)
**Environment**: QA — `{{QA_BASE_URL}}`
**Date**: YYYY-MM-DD HH:MM UTC
**Playwright version**: {{version}} (if automated)
**ADO Test Plan**: #{ADO_PLAN_ID} (if ADO enabled)

---

## Summary

| Metric | Value |
|--------|-------|
| Total TCs | {{N}} |
| Passed | {{N}} |
| Failed | {{N}} |
| Skipped | {{N}} |
| Pass rate | {{N}}% |
| Execution time | {{Nm Ns}} |

### Overall Result: ✅ PASS / ❌ FAIL / ⚠️ PARTIAL

---

## Results by Submodule

| Submodule | Total | Pass | Fail | Skip | Notes |
|-----------|-------|------|------|------|-------|
| {{submodule}} | | | | | |

---

## Detailed Results

| TC-ID | Title | Priority | Result | Duration | Notes |
|-------|-------|----------|--------|----------|-------|
| TC-{{M}}-{{S}}-001 | {{title}} | P0 | ✅ Pass | {{Xs}} | |
| TC-{{M}}-{{S}}-002 | {{title}} | P0 | ❌ Fail | {{Xs}} | DEF-{{NNN}} opened |
| TC-{{M}}-{{S}}-003 | {{title}} | P1 | ⏭️ Skip | — | DEF-{{NNN}} blocks |

---

## Failures Detail

### TC-{{M}}-{{S}}-{{NNN}} — {{Title}}

**Error**:
```
{{Error message or assertion failure output}}
```

**Screenshot**: `{{path-to-screenshot-if-any}}`

**Action taken**: DEF-{{NNN}} opened / escalated to Dev.

---

## Open Defects

| DEF-ID | Title | Severity | Linked TC | Status |
|--------|-------|----------|-----------|--------|
| DEF-{{NNN}} | {{title}} | High | TC-{{M}}-{{S}}-{{NNN}} | Open |

---

## Skipped Tests

| TC-ID | Reason |
|-------|--------|
| TC-{{M}}-{{S}}-{{NNN}} | DEF-{{NNN}} — {{short description}} |

---

## Environment Used

```
QA_BASE_URL={{QA_BASE_URL}}
Browser: Chromium {{version}}
Viewport: 1280x720
Workers: 1 (sequential, shared auth state)
Auth state: .auth/user-{{role}}.json (not committed)
```

> Credentials and tokens are NEVER logged in execution reports.

---

## Recommendations

1. **DEF-{{NNN}}**: High priority — unblocks {{N}} skipped P0 tests.
2. **Flaky risk**: TC-{{M}}-{{S}}-{{NNN}} passed on retry — investigate timing issue.
3. **Coverage gap**: {{submodule}} `{{scenario}}` has no automated coverage — manual execution required.

---

## Artifacts

| Artifact | Location |
|----------|----------|
| Playwright HTML report | `playwright-report/index.html` |
| Test results JSON | `test-results/` |
| Spec files | `qa/07-automation/e2e/{{module}}/` |
| ADO sync log | (if ADO enabled — see `integrations/ado-powershell/` output) |

---

## Sign-off

| Role | Name | Date |
|------|------|------|
| QA Analyst | | |
| Tech Lead | | |
