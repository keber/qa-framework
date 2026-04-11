---
name: qa-module-analysis
description: >
  Stage 1 of the QA pipeline. Analyzes an application module using browser automation
  to produce the 6-file specification set (inventory, business rules, workflows,
  roles, test data, test scenarios). Use when asked to analyze a module, explore a
  feature, document an application area, or start QA coverage for a new module.
  Prerequisite for all subsequent QA stages.
---

# QA Skill: Module Analysis (Stage 1 of 6)

**Stage**: 1 — Module Analysis  
**Prerequisite**: None — this is the first stage  
**Output**: `qa/01-specifications/module-{name}/submodule-{name}/` with 6 spec files  
**Next stage**: Stage 2 — Specification Generation (`qa-spec-generation`)

> **Pipeline rule**: This stage must be completed before any spec generation, test planning,
> or automation can begin. Do not skip to a later stage.

---

## Prerequisites

Before starting:

1. `qa/qa-framework.config.json` exists and contains `project.qaBaseUrl`
2. `qa/00-standards/naming-conventions.md` is available to check existing module codes
3. Browser automation (Playwright MCP or equivalent) is available
4. Ask the user for: module name, URL/route prefix, submodules in scope (or discover from UI)

**Security**: Never write credentials to any file. Use `<PLACEHOLDER>` for any credential value.

---

## Phase 1 — Preparation

1. Check if `qa/01-specifications/module-{name}/` already exists
   - **Exists**: read all existing files; only re-analyze what changed
   - **New**: create the directory and plan submodules
2. Allocate a unique 2–6 letter uppercase module code (check naming-conventions.md for conflicts)
3. Create `qa/01-specifications/module-{name}/README.md` listing all planned submodules before analysis begins

---

## Phase 2 — Exploration (one pass per submodule)

For each submodule, use browser automation to collect:

1. **Navigation** — URLs, page titles, breadcrumbs
2. **UI inventory** — all inputs (type, required, validation), dropdowns (options), buttons, tables, modals, badges
3. **API endpoints** — observe network requests during create/read/update/delete; record method, path, payload shape
4. **Role access** — log in as each configured role; record `can access / cannot access / permission error`
5. **Workflow** — execute the primary happy path; record steps, branch points, state transitions
6. **Business rules** — attempt invalid inputs and boundary conditions; record validation messages exactly

Detailed exploration checklist: `references/exploration-checklist.md`

---

## Phase 3 — Documentation (6-file output)

Produce 6 files per submodule. File formats and templates: `references/spec-file-formats.md`

| File | Contents |
|---|---|
| `00-inventory.md` | Module/submodule header, UI element table, API endpoint table |
| `01-business-rules.md` | `RN-{MODULE}-{NNN}` rules with type, trigger, error message |
| `02-workflows.md` | `FL-{MODULE}-{NNN}` flows with ASCII/Mermaid diagrams |
| `03-roles-permissions.md` | Role × feature access matrix; env var references for test users |
| `04-test-data.md` | Prerequisites, data shapes per scenario, EXEC_IDX pattern |
| `05-test-scenarios.md` | TC table: 50–85 TCs per submodule, all mandatory coverage categories |

TC target: **50–85 per submodule**. Mark origin as `UI-OBSERVED`, `PENDING-CODE`, or `BLOCKED-PERMISSIONS`.

---

## Phase 4 — Review

Completeness checklist before closing the stage:

- [ ] All menu items in the module have a submodule folder
- [ ] All `UI-OBSERVED` TCs were actually observed in this session
- [ ] No credentials appear in any file
- [ ] All TC IDs are unique across the module
- [ ] Module README updated with submodule table and TC counts
- [ ] `qa/README.md` module status row updated

---

## Outputs

- `qa/01-specifications/module-{name}/` — fully populated spec tree
- `qa/01-specifications/module-{name}/README.md` — updated with submodule table
- `qa/README.md` — module status row updated
