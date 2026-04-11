# Agent Instructions: Module Analysis

> ⚠️ **DEPRECATED**: This file is superseded by `.github/skills/qa-module-analysis/SKILL.md`.
> Kept as reference during the transition period. Do not update this file.

**File**: `agent-instructions/00-module-analysis.md`  
**Purpose**: Instructions for an AI agent to perform complete functional analysis of an application module and produce the 6-file specification set.

---

## When to use these instructions

Use this instruction set when:
- Analyzing a new module for the first time
- A module has been updated and its spec needs to be refreshed
- Building the initial `01-specifications/` tree for a project

---

## Prerequisites (Agent must verify before starting)

1. Confirm that `qa-framework.config.json` exists and contains `project.qaBaseUrl`
2. Confirm that `qa/00-standards/naming-conventions.md` is available
3. Confirm that the Playwright CLI (playwright-mcp or equivalent) is available for browser interaction
4. Ask the user for:
   - The module name and URL (or route prefix) to analyze
   - The submodules to analyze (if known; otherwise discover from the UI)
   - QA user credentials (handle via env vars — never store in markdown)

**⚠️ SECURITY**: Never write real credentials to any file. If credentials appear in any output, replace immediately with `<PLACEHOLDER>`.

---

## Phase 1 — Preparation

### 1.1 Review existing specs

Check if a `qa/01-specifications/module-{name}/` directory already exists.

- If it does: read all existing files to understand what is already documented. Only re-analyze what has changed.
- If it does not: create the directory structure.

### 1.2 Generate module code

If no module code exists yet, allocate a unique 2–6 uppercase letter code for the module.  
Check `qa/00-standards/naming-conventions.md` for existing codes to avoid conflicts.

Example: module "Operación" → code `OPER`; submodule "Catálogos" → code `CAT`

### 1.3 Plan the session

Identify all submodules in scope. A submodule typically corresponds to:
- A distinct menu item or section in the application
- A distinct CRUD entity (users, products, orders, etc.)
- A distinct workflow (approval, registration, reporting)

Document the planned submodules in `qa/01-specifications/module-{name}/README.md` before analysis begins.

---

## Phase 2 — Exploration

For each submodule, perform the following exploration using browser automation (Playwright CLI):

### 2.1 Navigation and route mapping

```
Navigate to {{QA_BASE_URL}} and log in with the appropriate role
Navigate to the submodule URL
Record:
  - Full URL of each page/view
  - Page title
  - Navigation breadcrumb
```

### 2.2 UI inventory

For each screen in the submodule:

```
Record all:
  - Input fields (name, type, required/optional, validation rules visible in UI)
  - Dropdowns (static or dynamic/AJAX, options if static)
  - Buttons (action, what they trigger)
  - Tables/grids (columns, default sorting, pagination)
  - Modals (trigger condition, fields, confirmation behavior)
  - Status indicators / badges / alerts
  - File upload / download controls
```

### 2.3 API endpoint discovery

```
Observe network requests during key interactions (create, read, update, delete)
Record:
  - Endpoint path (e.g., /api/GetUsers, api/CreateUser)
  - HTTP method
  - Request payload shape (field names)
  - Response shape (key fields)
```

### 2.4 Role-based access testing

```
For each configured test user role:
  Log in as that role
  Navigate to the submodule
  Record: can access? (YES / NO / PERMISSION_ERROR)
  Record: which actions are available vs hidden
```

### 2.5 Workflow discovery

```
Execute the primary happy path with appropriate test data
Record each step
Identify branch points (e.g., approve vs reject)
Record state transitions
```

### 2.6 Business rule discovery

```
Attempt invalid inputs for each validation
Record: validation message text, field that shows the error
Attempt boundary conditions (empty, max length, duplicate, etc.)
Record: system behavior
```

---

## Phase 3 — Documentation (6-file output)

Produce the following files for each submodule. Use the templates in `qa/00-standards/` and `templates/specification/`.

### File 00: `00-inventory.md`

Contents:
- Module header (name, code, URL, deployment date if known)
- Submodule header (name, code, routes)
- UI element inventory table
  - Element name | Type | Required | Notes
- API endpoint table
  - Method | Path | Purpose
- Key identifiers and selectors observed in the UI

### File 01: `01-business-rules.md`

Contents:
- Each rule as `RN-{MODULE}-{NNN}`: Description
- Rule type: Validation / Access Control / State Machine / Calculation / Integration
- Trigger: what user action triggers this rule
- Error message: exact text shown when rule is violated (if applicable)

Aim for 5–15 business rules per submodule.

### File 02: `02-workflows.md`

Contents:
- Each major workflow as `FL-{MODULE}-{NNN}`: Title
- Use ASCII flowchart or Mermaid block diagram
- Cover: happy path + main alternative paths + error paths

### File 03: `03-roles-permissions.md`

Contents:
- Role × Feature matrix table
  - Row: test user role
  - Column: feature/action (view, create, edit, delete, approve, export, etc.)
  - Cell: ✅ / ❌ / ⚠️ (limited)
- Notes on role inheritance or conditional access

### File 04: `04-test-data.md`

Contents:
- Prerequisites: what data must exist before tests run
- Data shapes: for each key test scenario, what data is needed
  - DO NOT include real user credentials
  - Use env var references for any credential: `process.env.QA_USER_EMAIL`
- Data dependencies between submodules (if any)

### File 05: `05-test-scenarios.md`

Contents:
- Summary table at top: total TCs, by priority, by type
- For each TC:
  - ID: `TC-{MODULE}-{SUBMODULE}-{NNN}`
  - Title: brief action description
  - Priority: P0 / P1 / P2 / P3
  - Type: Functional / Regression / Security / Negative / Integration
  - Origin: `UI-OBSERVED` / `PENDING-CODE` / `BLOCKED-PERMISSIONS`
  - Preconditions
  - Steps (numbered)
  - Expected result
  - Automation feasibility: Yes / Partial / No

Target: **50–85 TCs per submodule** is a well-analyzed submodule.

#### TC coverage must include:
- ✅ Access control (each role: can access / cannot access)
- ✅ Happy path (primary workflow end-to-end)
- ✅ Negative scenarios (required field empty, invalid format, duplicate, etc.)
- ✅ State transitions (create → edit → delete; pending → approved → rejected)
- ✅ Cross-module dependencies (if any)
- ✅ Export/download (if feature exists)
- ✅ Pagination/search (if feature exists)

TC origin rules:
- Only write `UI-OBSERVED` if you directly observed the behavior in the QA environment
- If a feature is documented but not visible in the QA environment: `PENDING-CODE`
- If you couldn't test it due to permission restrictions: `BLOCKED-PERMISSIONS`

---

## Phase 4 — Review and Session Summary

### 4.1 Completeness checklist

After completing all submodule files, verify:

- [ ] All menu items in the module have a corresponding submodule folder
- [ ] All TCs marked `UI-OBSERVED` were actually observed in this session
- [ ] `01-business-rules.md` covers all visible validation behaviors
- [ ] `03-roles-permissions.md` reflects the access observed for each role
- [ ] No credentials appear in any file
- [ ] All TC IDs are unique across the module
- [ ] Module README lists all submodules with their codes and TC counts

### 4.2 Write session summary

Create `qa/SESSION-SUMMARY-{YYYY-MM-DD}.md` with:

```markdown
# Session Summary — {YYYY-MM-DD}

## Module analyzed
{module-name} ({module-code})

## Submodules documented
| Submodule | Code | TC count | Notes |
|-----------|------|----------|-------|
| {name}    | {code} | {N}    | {any notable blocking issues} |

## Files created
- {list of all files created with their paths}

## Blockers
- {any features that couldn't be analyzed and why}

## Observations for next session
- {what to tackle next}
```

---

## Quality Standards

A well-executed module analysis session:

1. Takes between 2-6 hours depending on module complexity
2. Produces 6 files per submodule (not more, not less)
3. Has no hardcoded credentials in any file
4. Has TC IDs that follow the `TC-{MODULE}-{SUBMODULE}-{NNN}` pattern
5. Has business rules that are verifiable in automated tests
6. Has at least 1 P0 TC per submodule (the primary happy path)
7. Does not invent TCs for behavior that wasn't observed in the QA environment
