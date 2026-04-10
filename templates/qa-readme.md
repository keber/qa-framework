# QA — {PROJECT_DISPLAY_NAME}

> Framework: `@keber/qa-framework` v{VERSION}
> Language: {LANGUAGE} | Base URL: `{QA_BASE_URL}`

---

## Module Status

| Module | Submodule | TCs Total | TCs Automated | Plan | ADO Suite | Status | Last Run |
|---|---|---|---|---|---|---|---|
| {MODULE_NAME} | {SUBMODULE_NAME} | — | — | ⬜ | — | 🔲 Not started | — |

**Legend**: ✅ Done · ⚠️ Partial · 🔲 Not started · ⛔ Blocked

---

## Quick-Start Commands

```bash
# Run all automated tests
cd qa/07-automation
npx playwright test

# Run a specific module
npx playwright test tests/{module-folder}/

# Run with UI (debug mode)
npx playwright test --ui

# Generate HTML report
npx playwright show-report

# Re-run only failed tests
npx playwright test --last-failed
```

> Set credentials in `qa/07-automation/.env` (copy from `.env.example`).

---

## Active Blockers

| ID | Description | Affects | Opened | Status |
|---|---|---|---|---|
| — | No active blockers | — | — | — |

---

## Last Execution

| Date | Suite | Pass | Skip | Fail | Duration | Report |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — |

---

## Sprint History

<!-- Completed sprint checklists are moved here from AGENT-NEXT-STEPS.md -->
<!-- Format per sprint: -->
<!--
### Sprint N — {SPRINT_NAME} ({YYYY-MM-DD})

**Submodules**: {list}
**TCs automated**: {N} P0 + {M} P1
**Execution report**: `qa/05-test-execution/automated/{date-slug}.md`

Checklist (completed):
- [x] {Task 1}
- [x] {Task 2}
-->

_No sprints completed yet._

---

## Resources

| Resource | Link |
|---|---|
| QA Structure Guide | `qa/QA-STRUCTURE-GUIDE.md` |
| Naming Conventions | `qa/00-standards/naming-conventions.md` |
| Memory Index | `qa/memory/INDEX.md` |
| Agent Next Steps | `qa/AGENT-NEXT-STEPS.md` |
| Automation Config | `qa/07-automation/playwright.config.ts` |
