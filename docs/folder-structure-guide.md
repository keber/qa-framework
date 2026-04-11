# docs/folder-structure-guide.md

## `qa/` Directory Structure — Full Reference Guide

This document explains the purpose, contents, and conventions for every folder in the `qa/` directory.

---

## Overview

```
qa/
├── README.md                    ← Living master index (project-maintained)
├── AGENT-NEXT-STEPS.md          ← Active sprint queue for the agent (project-maintained)
├── QA-STRUCTURE-GUIDE.md        ← Copy of this guide (installed by framework)
├── qa-framework.config.json     ← Project configuration
│
├── 00-standards/                ← Naming conventions and artifact templates
├── 01-specifications/           ← Functional specifications per module
├── 02-test-plans/               ← Test plans (scope + priority decisions)
├── 03-test-cases/               ← Standalone test case documents
├── 04-test-data/                ← Test data definitions and factories
├── 05-test-execution/           ← Execution reports and results
├── 06-defects/                  ← Defect tracking (optional)
├── 07-automation/               ← Automation code (Playwright, etc.)
├── 08-azure-integration/        ← Azure DevOps integration (optional)
└── memory/                      ← Project QA learnings (project-maintained)
```

Agent skills live in `.github/skills/` (not inside `qa/`). See the `.github/skills/` section below.

---

## .github/skills/

**Purpose**: 3-layer QA pipeline skills installed by the framework. Loaded by the agent on demand — only the relevant skill for the current task is loaded, not all skills at once.

**Installed by framework** via `npm install @keber/qa-framework`:

| Skill folder | Stage | When the agent loads it |
|---|---|---|
| `qa-module-analysis/` | 1 | Analyzing a new module or refreshing specs |
| `qa-spec-generation/` | 2 | Writing the 6-file spec set |
| `qa-test-plan/` | 3 | Creating a test plan document |
| `qa-test-cases/` | 4 | Writing TC-*.md files |
| `qa-automation/` | 5 | Implementing Playwright specs |
| `qa-test-stabilization/` | 5b | Diagnosing and fixing failing tests |
| `qa-ado-integration/` | opt | Syncing with Azure DevOps Test Plans |
| `qa-maintenance/` | 6 | Updating specs and tests after app changes |

Each skill folder contains:
- `SKILL.md` — process outline (~400-600 tokens, always loaded when skill applies)
- `references/` — detailed templates and code patterns (loaded on demand)

---

## 00-standards/

**Purpose**: Non-negotiable naming conventions and artifact format standards.

**Installed by framework**:

| File | Contents |
|---|---|
| `naming-conventions.md` | All ID patterns (TC-*, RN-*, FL-*, DEF-*, folder names) |
| `test-case-template.md` | Full TC document template |
| `bug-report-template.md` | Full defect document template |
| `test-data-guidelines.md` | How to structure test data, credential policy |
| `execution-report-template.md` | How to write an execution report |

---

## 01-specifications/

**Purpose**: Functional specifications — the primary source of truth for what the application does and what must be tested.

**Structure**:
```
01-specifications/
├── README.md                    ← Index of all modules
├── shared/                      ← Shared artifacts (sitemap, shared templates)
│   ├── ui-menu-map.md           ← Auto-generated from playwright session
│   └── Instrucciones-analisis.md ← Checklist template for module analysis
│
└── module-{module-name}/
    ├── README.md                ← Module index (submodule table + E2E flow)
    └── submodule-{name}/
        ├── 00-inventory.md      ← UI elements, routes, APIs, fields
        ├── 01-business-rules.md ← RN-* rules the system enforces
        ├── 02-workflows.md      ← FL-* user flow diagrams (Mermaid/ASCII)
        ├── 03-roles-permissions.md ← Role matrix
        ├── 04-test-data.md      ← Data shapes and prerequisites
        └── 05-test-scenarios.md ← TC-* test cases with priority and steps
```

**Naming rules**:
- Module directory: `module-{kebab-name}` (e.g., `module-operacion`)
- Submodule directory: `submodule-{kebab-name}` (e.g., `submodule-aprobacion`)
- Module code: 2-6 uppercase letters (e.g., `OPER`, `PERS`, `ARCF`)
- TC ID: `TC-{MODULE}-{SUBMODULE}-{3-digit}` (e.g., `TC-OPER-CAT-001`)

**TC target per submodule**: 50–85 test cases is considered a well-analyzed submodule.

---

## 02-test-plans/

**Purpose**: Documents that define the scope, priorities, and approach for testing a module or sprint.

```
02-test-plans/
├── README.md
├── automated/
│   └── {module}-automated-test-plan.md
└── manual/
    ├── {module}-manual-test-plan.md
    └── exploratory/
        └── {module}-exploratory-session.md
```

A test plan specifies:
- Which TCs from `01-specifications/` are in scope
- Priority assignment (P0/P1/P2/P3)
- Which TCs will be automated vs manual
- Estimated automation feasibility (fully/partially/not automatable)
- ADO Test Suite mapping (if ADO is enabled)

---

## 03-test-cases/

**Purpose**: Standalone, detailed test case documents when more depth is needed than `05-test-scenarios.md` provides.

Most projects will have sparse content here — the 05-test-scenarios.md files inside specs contain the TC tables. This folder is for cases that are too complex to fit in a table row.

```
03-test-cases/
├── README.md
├── automated/
│   └── TC-{ID}-{title}.md
└── manual/
    └── TC-{ID}-{title}.md
```

---

## 04-test-data/

**Purpose**: All test data definitions, no credentials.

```
04-test-data/
├── README.md
├── users.md         ← Test user definitions (roles, env var references, NOT passwords)
├── fixtures/        ← Static data files (JSON/Markdown)
├── factories/       ← Dynamic data generation patterns (Markdown or TS files)
└── seeders/         ← DB/API seed scripts for complex test setup
```

**Critical rules**:
- Never put real passwords in this folder
- User tables list roles + env var names, not actual credentials
- Use `process.env.QA_USER_EMAIL` style references throughout
- For test data that requires unique values per run, document the `EXEC_IDX` pattern

---

## 05-test-execution/

**Purpose**: Evidence of test runs — reports, results, and screenshots.

```
05-test-execution/
├── README.md
├── automated/
│   ├── {YYYY-MM-DD_HH-MM-SS_desc}.md    ← Execution report (human-readable summary)
│   └── test-results/                    ← Playwright output (gitignored if large)
│       └── .last-run.json
└── manual/
    ├── exploratory/
    │   └── {YYYY-MM-DD_desc}.md
    └── regression/
```

**Execution report format** (see `00-standards/execution-report-template.md`):
- Summary table: total/pass/skip/fail + duration
- Per-test table with individual times
- Defect links for any skipped tests
- Env var commands sanitized with `<PLACEHOLDER>`

---

## 06-defects/

**Purpose**: Defect tracking. Optional when Azure DevOps is used.

```
06-defects/
├── README.md
├── active/
│   └── DEF-{NNN}-{slug}.md
└── resolved/
    └── DEF-{NNN}-{slug}.md
```

**Decision guide**:
- ADO enabled → use ADO Work Items. `06-defects/` contains lightweight references only
- ADO disabled → use this folder as primary defect tracker
- Either way: `test.skip()` references a defect ID so the skip is traceable

See `docs/generalization-decisions.md §7` for the full evaluation of this folder.

---

## 07-automation/

**Purpose**: All automation code, configuration, and related tooling.

```
07-automation/
├── README.md                       ← How to run, where reports go, worker config
├── e2e/                            ← Playwright E2E tests
│   ├── package.json
│   ├── playwright.config.ts
│   ├── global-setup.ts             ← Pre-suite login + storageState save
│   ├── .env                        ← Local credentials (NEVER commit)
│   ├── .env.example                ← Template (always commit)
│   ├── .auth/                      ← storageState files (gitignored)
│   ├── fixtures/
│   │   ├── auth.ts                 ← loginAs(page, role) helper
│   │   └── test-helpers.ts         ← EXEC_IDX, date helpers, etc.
│   ├── page-objects/               ← Page Object Model classes
│   ├── tests/
│   │   ├── {module}/               ← Tests by module
│   │   ├── helpers/debug/          ← Diagnostic scripts (not part of suite)
│   │   └── seeds/                  ← Data seeding specs (excluded from runs)
│   ├── diagnosis/                  ← Screenshots and debug output (gitignored)
│   └── scripts/                    ← One-off utility scripts
└── integration/                    ← API-level tests (if applicable)
```

**Important rules**:
- Always run Playwright from the **repo root**, not from inside `qa/07-automation/e2e/`
- Seeds are excluded from normal test runs via `testIgnore` in `playwright.config.ts`
- Debug artifacts go into `diagnosis/` — never into the repo root
- `.auth/` is always gitignored

---

## 08-azure-integration/

**Purpose**: Azure DevOps integration configuration and scripts. Only present when ADO is enabled.

```
08-azure-integration/
├── README.md
├── AGENT-ADO-INTEGRATION.md        ← Agent instructions for ADO operations
├── PLAYWRIGHT-AZURE-REPORTER-PLAN.md ← Reporter setup and migration log
├── module-registry.json            ← Module → spec path → ADO plan/suite IDs
├── ado-ids-mapping-{project}.json  ← Complete TC → ADO WI ID registry
├── pipelines/
│   └── azure-pipeline-qa.yml       ← CI/CD pipeline definition
└── scripts/
    ├── inject-ado-ids.ps1          ← Injects [ID] prefix into spec files
    ├── create-testplan-from-mapping.ps1 ← Creates ADO plan from mapping JSON
    └── sync-ado-titles.ps1         ← Syncs spec titles with ADO TC titles
```

---

## `qa/README.md` — The Living Index

The `qa/README.md` is the primary human-readable project status document. It should be updated whenever:
- A new module is analyzed
- A new test execution is completed
- A blocker is identified or resolved
- A major milestone or sprint is completed

Minimum contents:
- Module status table (name, TCs documented, TCs automated, ADO plan link)
- Quick-start commands for common tasks
- Active blockers section
- Last execution results summary
- **`## Sprint History`** section — completed sprint checklists moved here from `AGENT-NEXT-STEPS.md`

Template: `templates/qa-readme.md`

---

## `qa/AGENT-NEXT-STEPS.md` — Sprint Queue

The `AGENT-NEXT-STEPS.md` is the agent's task queue for the current sprint. It is read by the agent at the start of every conversation.

**Design principles (SRP + KISS)**:
- Contains **one active sprint only** — no history, no completed checklists
- Three sections maximum: module status table, active sprint checklist, context references
- Does not repeat standing instructions already in `copilot-instructions.md`
- Detailed environment notes and patterns belong in `qa/memory/`, referenced from here

When a sprint completes, the agent **moves** the completed checklist to `qa/README.md → ## Sprint History` and **deletes** that section from this file.

Template: `templates/agent-next-steps.md`

---

## `qa/memory/` — Project QA Learnings

Project-maintained folder for accumulated knowledge about the application under test: environment quirks, DOM patterns, Playwright gotchas, sprint-specific discoveries.

```
qa/memory/
├── INDEX.md                          ← Required entry point — index of all files
├── {technology}-patterns.md          ← Framework/stack-specific patterns (e.g., playwright-blazor-wasm-patterns.md)
├── {sprint-name}-discovery.md        ← DOM/UI findings for an in-progress sprint
└── {sprint-name}-lessons.md          ← Retrospective patterns after a sprint completes
```

### `qa/memory/INDEX.md` — Required

The `INDEX.md` is the **gate** that the agent reads before loading any other memory file. Its purpose is to let the agent load only what is relevant to the current task, rather than loading all files.

```markdown
# Memory Index — {PROJECT_NAME}

| File | Topic | When to load |
|---|---|---|
| playwright-blazor-wasm-patterns.md | Blazor/Radzen DOM patterns | Any Playwright automation task |
| sprint4-discovery.md | DOM quirks for BusinessPartner module | Sprint 4 automation only |
| sprint3-lessons.md | Patterns from Sprint 3 | Reference when working on similar modules |
```

**Rules for `qa/memory/`**:
- Always update `INDEX.md` when adding or modifying a memory file
- Sprint-specific discovery files (`sprint-N-discovery.md`) are for the duration of that sprint; consolidate long-term patterns into a technology-specific file afterwards
- Never load all memory files unconditionally — always read `INDEX.md` first and select by relevance

---

## Session Summary Files

Optionally, place `SESSION-SUMMARY-YYYY-MM-DD.md` at the `qa/` root after each major working session. These files:
- Document what was produced in the session
- Record any blockers encountered
- Provide the starting point for the next session

This is especially valuable for agents — a session summary provides continuity across multiple chat sessions.
