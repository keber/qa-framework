# docs/folder-structure-guide.md

## `qa/` Directory Structure - Full Reference Guide

This document explains the purpose, contents, and conventions for every folder in the `qa/` directory.

---

## Overview

```
qa/
├── README.md                    <- Living master index (project-maintained)
├── AGENT-NEXT-STEPS.md          <- Active sprint queue for the agent (project-maintained)
├── QA-STRUCTURE-GUIDE.md        <- Copy of this guide (installed by framework)
├── qa-framework.config.json     <- Project configuration
│
├── 00-standards/                <- Naming conventions and artifact templates
├── 01-specifications/           <- Functional specifications per module
├── 02-test-plans/               <- Plan de Pruebas per sprint/module (plan + TC table + steps)
├── 03-test-cases/               <- Standalone test case documents
├── 04-test-data/                <- Test data definitions and factories
├── 05-test-execution/           <- Execution reports and results
├── 06-defects/                  <- Defect tracking (optional)
├── 07-automation/               <- Automation code (Playwright, etc.)
├── 08-azure-integration/        <- Azure DevOps integration (optional)
└── memory/                      <- Project QA learnings (project-maintained)
```

Agent skills live in `.github/skills/` (not inside `qa/`). See the `.github/skills/` section below.

`init`/`upgrade` also generate `.claude/rules/qa-framework.md` and `.claude/commands/qa-*.md`
(Claude Code equivalents of the Copilot instructions/skills - see the section below).

---

## Dual-Track Pipeline

All pipeline paths share the same input: `01-specifications/`. From there, work splits into
two tracks that can run in parallel or independently depending on team maturity.

```
01-specifications/  (source of truth - what the app does and what must be tested)
        │
        ├─── Automation track ──────────────────────────────────────────────────
        │         │
        │         ▼
        │    02-test-plans/sprints/Sprint-{N}/    <- Plan de Pruebas (plan + TC table + steps)
        │         │                                  Stage 4 expands steps if needed
        │         ▼
        │    07-automation/e2e/tests/      <- Playwright .spec.ts files
        │         │
        │         ▼
        │    05-test-execution/automated/  <- execution reports
        │         │
        │         ▼
        │    08-azure-integration/         <- ADO sync via playwright-azure-reporter
        │
        └─── Manual track ──────────────────────────────────────────────────────
                  │
                  ▼
             02-test-plans/sprints/Sprint-{N}/    <- same Plan de Pruebas (shared artifact)
                  │
                  ▼
             03-test-cases/ (optional)     <- standalone TC-*.md for complex/reusable TCs
                  │
                  ▼
             05-test-execution/manual/     <- manual run evidence
                  │
                  ▼
             08-azure-integration/         <- ADO sync via ado-integration skill
                                              (reads Plan de Pruebas, creates TCs with steps)
```

**Entry points:**

| Scenario | Entry point | Tracks active |
|---|---|---|
| New system, no prior QA | Module analysis -> spec generation | Automation (primary), Manual (as needed) |
| Sprint with ADO stories | Stories -> spec generation -> test plan | Both, driven by sprint scope |
| Maintenance/continuous improvement | Changed module -> maintenance skill | Automation (update existing tests) |

**Track selection guidance:**
- Use **automation track** when the goal is regression coverage and CI integration.
- Use **manual track** when: (a) team has manual testers who need step-by-step documents; (b) auditability or traceability to external standards is required; (c) features are not yet automatable.
- Both tracks use the same TC-IDs from `01-specifications/*/05-test-scenarios.md` - traceability is preserved regardless of which track executes a given TC.
- `04-test-data/` is optional in both tracks. Use it when test data factories or seeders are shared across multiple modules. Per-submodule data belongs in `01-specifications/*/04-test-data.md`.

---

## .github/skills/

**Purpose**: 3-layer QA pipeline skills installed by the framework. Loaded by the agent on demand - only the relevant skill for the current task is loaded, not all skills at once.

**Installed by framework** via `npm install @keber/qa-framework`:

| Skill folder | Stage | When the agent loads it |
|---|---|---|
| `qa-module-analysis/` | 1 | Analyzing a new module or refreshing specs |
| `qa-spec-generation/` | 2 | Writing the 6-file spec set |
| `qa-test-plan/` | 3 | Creating a test plan document |
| `qa-test-cases/` | 4 | Writing TC-*.md files |
| `qa-automation/` | 5 | Implementing Playwright specs |
| `qa-api-integration/` | 5 | Writing API tests in `qa/07-automation/integration/` |
| `qa-test-stabilization/` | 5b | Diagnosing and fixing failing tests |
| `qa-ado-integration/` | opt | Syncing with Azure DevOps Test Plans |
| `qa-maintenance/` | 6 | Updating specs and tests after app changes |
| `qa-performance-k6/` | opt | Planning, running and reporting a k6 performance test of named endpoints |

Each skill folder contains:
- `SKILL.md` - process outline (~400-600 tokens, always loaded when skill applies)
- `references/` - detailed templates and code patterns (loaded on demand)

---

## .claude/commands/ and .claude/rules/

**Purpose**: Claude Code native equivalents of `.github/instructions/qa-framework.instructions.md`
and `.github/skills/`, generated by `init`/`upgrade` in parallel with the Copilot artifacts
(no agent detection - both are always generated).

| File | Role |
|---|---|
| `.claude/rules/qa-framework.md` | Same 11 agent behavior rules + pipeline table as the Copilot instructions file. No frontmatter, so it loads unconditionally in every Claude Code session (equivalent to `applyTo: '**'`). |
| `.claude/commands/qa-{name}.md` | One thin wrapper per skill folder under `.github/skills/`, discovered dynamically (not hardcoded). Each wrapper reads: `Read the full skill at .github/skills/qa-{name}/SKILL.md FIRST, then follow its instructions exactly`, plus the stage prerequisite. Invoked as `/qa-{name}` in a Claude Code session. |

This is a "thin wrapper" pattern: the command never duplicates skill content, it only
points back at `SKILL.md` as the single source of truth. Updating a skill automatically
updates every command that references it - no regeneration needed, zero drift possible.

---

## Project additions

Skills, generated commands, `.claude/rules/qa-framework.md`,
`.github/instructions/qa-framework.instructions.md` and `qa/QA-STRUCTURE-GUIDE.md` are
framework-owned: `upgrade` overwrites them, so a project edit made there does not survive
the next upgrade as a live rule. Put project rules and documents where the framework
never writes:

| What the project adds | Where it goes |
|---|---|
| Agent rules for Claude Code | `.claude/rules/<project>.md` (loaded next to `qa-framework.md`) |
| Agent rules for Copilot | `.github/instructions/<project>.instructions.md` |
| Project standards, templates and conventions | New files in `qa/00-standards/` (the framework only creates its own documents there when they are missing and never overwrites an existing one) |
| Learnings and technology patterns | `qa/memory/` |

When a project rule is general enough to help every project, propose it upstream instead
of editing the framework-owned copy.

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
| `execution-report-template.md` | How to write the execution report of one automation run (saved in `05-test-execution/`; not the sprint closeout documents of `02-test-plans/`) |
| `write-safety-policy.md` | The single write policy for tests that can change data in a system under test (API, load, scripts) |
| `api-testing-conventions.md` | The project's own API values and observations; the method lives in the `qa-api-integration` skill |
| `agents-md-template.md` | Review rulebook template: ten sections of rules with citable IDs, a tracked exceptions register and a "what NOT to report" table. Copy it to `AGENTS.md` at the repository root and fill in the placeholders. The framework never writes or edits a root `AGENTS.md` |
| `pr-review-rubric.md` | What QA certifies when it approves a pull request: the work item as review unit, criteria with citable codes in three escalation levels (Blocking, Warning, Informational) plus suspended criteria, the vote and comment rules, and the review report template. Project-owned: installed once, never overwritten |

---

## 01-specifications/

**Purpose**: Functional specifications - the primary source of truth for what the application does and what must be tested.

**Structure**:
```
01-specifications/
├── README.md                    <- Index of all modules
├── shared/                      <- Shared artifacts (sitemap, shared templates)
│   ├── ui-menu-map.md           <- Auto-generated from playwright session
│   └── Instrucciones-analisis.md <- Checklist template for module analysis
│
└── module-{module-name}/
    ├── README.md                <- Module index (submodule table + E2E flow)
    └── submodule-{name}/
        ├── 00-inventory.md      <- UI elements, routes, APIs, fields
        ├── 01-business-rules.md <- RN-* rules the system enforces
        ├── 02-workflows.md      <- FL-* user flow diagrams (Mermaid/ASCII)
        ├── 03-roles-permissions.md <- Role matrix
        ├── 04-test-data.md      <- Data shapes and prerequisites
        └── 05-test-scenarios.md <- TC-* test cases with priority and steps
```

**Naming rules**:
- Module directory: `module-{kebab-name}` (e.g., `module-operacion`)
- Submodule directory: `submodule-{kebab-name}` (e.g., `submodule-aprobacion`)
- Module code: 2-6 uppercase letters (e.g., `OPER`, `PERS`, `ARCF`)
- TC ID: `TC-{MODULE}-{SUBMODULE}-{3-digit}` (e.g., `TC-OPER-CAT-001`)

**TC target per submodule**: 50-85 test cases is considered a well-analyzed submodule.

---

## 02-test-plans/

**Purpose**: Plan de Pruebas documents per sprint and module. Each document combines test plan context (scope, strategy, preconditions) with a detailed test case table including numbered steps. This is the primary artifact for both the automation track and ADO integration.

```
02-test-plans/
├── README.md
├── sprints/                                                     <- active sprints
│   └── Sprint-{N}/
│       ├── Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md  <- one per module
│       ├── Plan-de-Pruebas-{proyecto}-Sprint-{N}.md           <- consolidado (generated by @keber/ado-qa, not by agent)
│       ├── Reporte-de-Ejecucion-de-Pruebas-{proyecto}-Sprint-{N}.md     <- closeout (qa-reporte-ejecucion agent)
│       └── Informe-de-Resultados-de-Pruebas-{proyecto}-Sprint-{N}.md    <- closeout (qa-informe-resultados agent)
└── historical/                                                  <- closed sprints
    └── sprint-{N}/
        ├── ado-export-<YYYY-MM-DD>/                             <- raw ADO export, one folder per export date, never overwritten
        ├── Plan-de-Pruebas-{proyecto}-Sprint-{N}*.md
        ├── Reporte-de-Ejecucion-de-Pruebas-{proyecto}-Sprint-{N}.md
        └── Informe-de-Resultados-de-Pruebas-{proyecto}-Sprint-{N}.md
```

**Sprint closeout documents.** Three distinct artifacts, written by the shipped agents (`.claude/agents/`), not by `init`:

1. **Raw ADO export** (`ado-export-<YYYY-MM-DD>/`): the unedited output of the `ado-qa` export. A new export goes to a new dated folder, so the sprint keeps its progress history.
2. **Reporte de Ejecución de Pruebas**: the latest raw export promoted to a readable report with a summary and a findings table (`qa-reporte-ejecucion` agent).
3. **Informe de Resultados de Pruebas**: the narrative closeout that business and project management read to decide a release; it consumes the Reporte (`qa-informe-resultados` agent).

The closeout documents use the sprint number without zero-padding (`{N}`), as the agents write them. None of them is the run-level execution report of `00-standards/execution-report-template.md`: that one describes a single automation run and belongs in `05-test-execution/`, never in `02-test-plans/`.

**Naming convention**: `Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md`
- `{proyecto}` = `project.name` from `qa-framework.config.json`
- `{N}` = sprint number without zero padding (e.g., `7`, `40`), in the folder name and the file name alike. No framework script parses this number, so sprint folders padded under an older version of this guide (`040`) keep working; use the unpadded form for new sprints.
- `{modulo}` = module code from specs (e.g., `RCL-Casino`, `ARCF`)

**What each Plan de Pruebas contains**:
- Header (project, sprint, dates, ADO Test Plan link)
- Scope, strategy, preconditions, test data
- **Tabla de Pruebas**: TC-ID | Suite | Título | Descripción | Steps (numbered `<br>`-separated) | Resultado Esperado | Confirma (Task ID or N/A) | Tipo | Prioridad
- Matriz de trazabilidad (Task <-> N)
- Automation notes

**Legacy migration**: `upgrade` Section 6 moves `automated/` and `manual/` subdirectories to `sprints/legacy-*` non-destructively.

---

## 03-test-cases/

**Purpose**: Optional standalone test case documents for complex or reusable TCs.

> **Note (v1.7.0+)**: The primary test case artifact is the Tabla de Pruebas inside each Plan de Pruebas (`02-test-plans/sprints/`). This folder is for edge cases where a TC is too complex to fit in a table row, or where a TC is shared across multiple sprints unchanged.

```
03-test-cases/
├── README.md   <- explains optional/legacy status
└── TC-{ID}-{title}.md
```

**When to create standalone TCs here**:
- TC requires multi-role, multi-session, or multi-system steps that don't fit a table row
- TC is reused across multiple sprints with no changes (cross-reference from Plan de Pruebas table)
- Legacy TCs migrated from pre-v1.7.0 structure

---

## 04-test-data/

**Purpose**: All test data definitions, no credentials.

```
04-test-data/
├── README.md
├── users.md         <- Test user definitions (roles, env var references, NOT passwords)
├── fixtures/        <- Static data files (JSON/Markdown)
├── factories/       <- Dynamic data generation patterns (Markdown or TS files)
└── seeders/         <- DB/API seed scripts for complex test setup
```

**Critical rules**:
- Never put real passwords in this folder
- User tables list roles + env var names, not actual credentials
- Use `process.env.QA_USER_EMAIL` style references throughout
- For test data that requires unique values per run, document the `EXEC_IDX` pattern

---

## 05-test-execution/

**Purpose**: Evidence of test runs - reports, results, and screenshots.

```
05-test-execution/
├── README.md
├── automated/
│   ├── {YYYY-MM-DD_HH-MM-SS_desc}.md    <- Execution report (human-readable summary)
│   └── test-results/                    <- Playwright output (gitignored if large)
│       └── .last-run.json
├── performance/
│   └── {YYYY-MM-DD}-{topic}/            <- k6 report, raw summary and plan copy (qa-performance-k6)
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
├── open/
│   └── DEF-{NNN}-{slug}.md
├── disputed/
│   └── DEF-{NNN}-{slug}.md
├── resolved/
│   └── DEF-{NNN}-{slug}.md
└── recommendations/
    ├── README.md
    └── REC-{NNN}-{slug}.md
```

- `open/` - confirmed defect, fix pending
- `disputed/` - QA has evidence but business or dev team disputes the expected behavior; pending functional decision
- `resolved/` - closed by fix or formal decision
- `recommendations/` - a finding that violates no business rule (technical debt, usability, accessibility, testability, latent risk). Not a defect: own `REC-` numbering, no `test.fail()`, no Bug in the tracker. If a source later defines the rule, it moves to `open/`

A finding reclassified from defect to recommendation gets a new `REC-` id; its `DEF-` number stays retired and is never reused.

**Decision guide**:
- ADO enabled -> use ADO Work Items. `06-defects/` contains lightweight references only
- ADO disabled -> use this folder as primary defect tracker
- Either way: `test.skip()` references a defect ID so the skip is traceable

See `docs/generalization-decisions.md §7` for the full evaluation of this folder.

---

## 07-automation/

**Purpose**: All automation code, configuration, and related tooling.

```
07-automation/
├── README.md                       <- How to run, where reports go, worker config
├── e2e/                            <- Playwright E2E project (self-contained)
│   ├── playwright.config.ts        <- Test runner config (installed by init)
│   ├── package.json                <- Playwright dependencies (installed by init)
│   ├── global-setup.ts             <- The only login: once per lane, saves storageState (installed by init)
│   ├── .env                        <- Local credentials (NEVER commit)
│   ├── .env.example                <- Template (always commit, installed by init)
│   ├── .auth/                      <- storageState files (gitignored)
│   ├── fixtures/                   <- Installed by init
│   │   ├── auth.ts             <- loginAs(page, role), only for *.login.spec.ts (login-flow project)
│   │   ├── defects.ts          <- openDefect / expectOpenDefect / InfraError (defect polarity)
│   │   └── test-helpers.ts     <- EXEC_IDX, date helpers, etc.
│   ├── scripts/                    <- Installed by init: lane lock, global-setup guards,
│   │                                  run-opt-in.js (npm run test:<opt-in project>)
│   ├── page-objects/               <- Page Object Model classes (project-maintained)
│   ├── tests/                      <- Spec files, organized by module
│   │   ├── {module}/           <- Stub .spec.ts files generated by init per submodule
│   │   ├── helpers/debug/      <- Diagnostic scripts (not part of suite)
│   │   └── seeds/              <- Data seeding specs (excluded from runs)
│   └── diagnosis/                  <- Screenshots and debug output (gitignored)
├── integration/                    <- API-level tests (k6, JMeter, Azure Load Testing)
│   └── README.md                   <- Integration test setup and run instructions
└── load/                           <- Load / performance tests
    ├── README.md                   <- Load test setup and run instructions
    └── k6/                         <- k6 scaffold installed by init (qa-performance-k6 skill)
        ├── run-perf.js             <- Validates the plan, enforces the safety rules, runs k6, saves the report
        ├── perf-guard.js           <- Plan validation and safety rules
        ├── perf-script.js          <- Plan-driven k6 script
        ├── build-report.js         <- Markdown report from a k6 summary and its plan
        ├── plans/                  <- plan.schema.json, _example.plan.json and the project's plans
        └── .session/               <- Session files for k6 runs (gitignored)
```

**Important rules**:
- Run Playwright from `qa/07-automation/e2e/` (where `playwright.config.ts` lives): `cd qa/07-automation/e2e && npx playwright test`
- Seeds are excluded from normal test runs via `testIgnore` in `playwright.config.ts`
- Debug artifacts go into `e2e/diagnosis/` -- never into the repo root
- `.auth/` and `.env` are always gitignored
- Files installed by `init` must not be deleted -- they are the project's automation bootstrap
- `integration/` and `load/` are independent projects with their own toolchains (k6, JMeter, etc.) -- they do not depend on `e2e/`

---

## 08-azure-integration/

**Purpose**: Azure DevOps integration configuration and scripts. Only present when ADO is enabled.

```
08-azure-integration/
├── README.md
├── AGENT-ADO-INTEGRATION.md        <- Agent instructions for ADO operations
├── PLAYWRIGHT-AZURE-REPORTER-PLAN.md <- Reporter setup and migration log
├── module-registry.json            <- Module -> spec path -> ADO plan/suite IDs
├── ado-ids-mapping-{project}.json  <- Complete TC -> ADO WI ID registry
├── pipelines/
│   └── azure-pipeline-qa.yml       <- CI/CD pipeline definition
└── scripts/
    ├── inject-ado-ids.ps1          <- Injects [ID] prefix into spec files
    ├── create-testplan-from-mapping.ps1 <- Creates ADO plan from mapping JSON
    └── sync-ado-titles.ps1         <- Syncs spec titles with ADO TC titles
```

---

## `qa/README.md` - The Living Index

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
- **`## Sprint History`** section - completed sprint checklists moved here from `AGENT-NEXT-STEPS.md`

Template: `templates/qa-readme.md`

---

## `qa/AGENT-NEXT-STEPS.md` - Sprint Queue

The `AGENT-NEXT-STEPS.md` is the agent's task queue for the current sprint. It is read by the agent at the start of every conversation.

**Design principles (SRP + KISS)**:
- Contains **one active sprint only** - no history, no completed checklists
- Three sections maximum: module status table, active sprint checklist, context references
- Does not repeat standing instructions already in `qa-framework.instructions.md`
- Detailed environment notes and patterns belong in `qa/memory/`, referenced from here

When a sprint completes, the agent **moves** the completed checklist to `qa/README.md -> ## Sprint History` and **deletes** that section from this file.

Template: `templates/agent-next-steps.md`

---

## `qa/memory/` - Project QA Learnings

Project-maintained folder for accumulated knowledge about the application under test: environment quirks, DOM patterns, Playwright gotchas, sprint-specific discoveries.

```
qa/memory/
├── INDEX.md                          <- Required entry point - index of all files
├── {technology}-patterns.md          <- Framework/stack-specific patterns (e.g., playwright-blazor-wasm-patterns.md)
├── {sprint-name}-discovery.md        <- DOM/UI findings for an in-progress sprint
└── {sprint-name}-lessons.md          <- Retrospective patterns after a sprint completes
```

### `qa/memory/INDEX.md` - Required

The `INDEX.md` is the **gate** that the agent reads before loading any other memory file. Its purpose is to let the agent load only what is relevant to the current task, rather than loading all files.

```markdown
# Memory Index - {PROJECT_NAME}

| File | Topic | When to load |
|---|---|---|
| playwright-blazor-wasm-patterns.md | Blazor/Radzen DOM patterns | Any Playwright automation task |
| sprint4-discovery.md | DOM quirks for BusinessPartner module | Sprint 4 automation only |
| sprint3-lessons.md | Patterns from Sprint 3 | Reference when working on similar modules |
```

**Rules for `qa/memory/`**:
- Always update `INDEX.md` when adding or modifying a memory file
- Sprint-specific discovery files (`sprint-N-discovery.md`) are for the duration of that sprint; consolidate long-term patterns into a technology-specific file afterwards
- Never load all memory files unconditionally - always read `INDEX.md` first and select by relevance

---

## Session Summary Files

Optionally, place `SESSION-SUMMARY-YYYY-MM-DD.md` at the `qa/` root after each major working session. These files:
- Document what was produced in the session
- Record any blockers encountered
- Provide the starting point for the next session

This is especially valuable for agents - a session summary provides continuity across multiple chat sessions.
