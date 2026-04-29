# docs/architecture.md

## Framework Architecture

**Version**: 1.6.0  
**Date**: 2026-04-29

---

## Design Goals

1. **Decoupled core** — the framework works without Playwright, without Azure DevOps, without any specific CI/CD system
2. **Layered optionality** — features are added as explicit opt-in integrations, not baked into the core
3. **Agent-first design** — every convention exists so that an IDE agent can navigate and produce artifacts predictably
4. **Spec-before-automation** — the specification layer is always the source of truth; automation references specs, never the reverse
5. **Parameterization over hardcoding** — project-specific values live in `qa-framework.config.json`, not in framework files

---

## Component Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          qa-framework (npm package)                         │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        FRAMEWORK CORE                               │   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │   │
│  │  │  qa/ structure │  │  Agent skills    │  │  Standards &        │  │   │
│  │  │  (10 folders)  │  │  (8 skill sets,  │  │  Naming conventions │  │   │
│  │  │                │  │  3-layer model)  │  │                     │  │   │
│  │  └────────────────┘  └──────────────────┘  └─────────────────────┘  │   │
│  │                                                                      │   │
│  │  ┌────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  │   │
│  │  │  6-file        │  │  CLI commands    │  │  Config schema      │  │   │
│  │  │  submodule     │  │  (init/upgrade/  │  │  (qa-framework.     │  │   │
│  │  │  templates     │  │  generate/       │  │   config.json)      │  │   │
│  │  └────────────────┘  │  validate)       │  └─────────────────────┘  │   │
│  │                       └──────────────────┘                           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      OPTIONAL INTEGRATIONS                          │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────┐    ┌──────────────────────────────┐    │   │
│  │  │  playwright/            │    │  playwright-azure-reporter/  │    │   │
│  │  │  - e2e/playwright.cfg   │    │  - reporter config template  │    │   │
│  │  │  - e2e/global-setup.ts  │    │  - ado-ids-mapping.json      │    │   │
│  │  │  - e2e/fixtures/        │    │  - inject-ado-ids.ps1        │    │   │
│  │  │  - e2e/.env.example     │    │  - module-registry.json      │    │   │
│  │  └─────────────────────────┘    └──────────────────────────────┘    │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────┐                                        │   │
│  │  │  ado-powershell/        │                                        │   │
│  │  │  - create-testplan.ps1  │                                        │   │
│  │  │  - sync-ado-titles.ps1  │                                        │   │
│  │  │  - azure-pipeline.yml   │                                        │   │
│  │  └─────────────────────────┘                                        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

                         installs into project as:

┌─────────────────────────────────────────────────────────────────────────────┐
│                         TARGET PROJECT                                      │
│                                                                             │
│  qa/                                                                        │
│  ├── README.md                   <- living index (project-specific)         │
│  ├── AGENT-NEXT-STEPS.md         <- active sprint queue (project-specific)  │
│  ├── QA-STRUCTURE-GUIDE.md       <- copy from framework (framework-owned)   │
│  ├── qa-framework.config.json    <- project config (parameterized)          │
│  │                                                                          │
│  ├── 00-standards/               <- naming + templates (copied from pkg)    │
│  ├── 01-specifications/          <- generated per module (project work)     │
│  ├── 02-test-plans/              <- generated (project work)                │
│  ├── 03-test-cases/              <- generated (project work)                │
│  ├── 04-test-data/               <- project data (project work)             │
│  ├── 05-test-execution/          <- execution reports (project work)        │
│  ├── 06-defects/open|resolved/   <- optional defect cache                   │
│  ├── 07-automation/e2e/          <- Playwright project (self-contained)     │
│  ├── 07-automation/integration/  <- API/integration tests                   │
│  ├── 07-automation/load/         <- load/performance tests                  │
│  ├── 08-azure-integration/       <- optional ADO integration                │
│  └── memory/                     <- agent learnings (project-maintained)    │
│                                                                             │
│  .github/copilot-instructions.md <- generated (framework-owned)            │
│  .github/skills/                 <- copied from package (framework-owned)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Spec-Driven Automation

```
Module analysis (agent)
        │
        ▼
01-specifications/module-X/submodule-Y/
  ├── 00-inventory.md       ← what exists in the UI
  ├── 01-business-rules.md  ← RN-* identifiers
  ├── 02-workflows.md       ← FL-* flowcharts
  ├── 03-roles-permissions.md
  ├── 04-test-data.md
  └── 05-test-scenarios.md  ← TC-* identifiers  ──────────────────────┐
                                                                       │
        │                                                              │
        ▼                                                              ▼
02-test-plans/{module}.md               03-test-cases/{TC-ID}.md
(selects TCs, assigns priority)         (detailed per-test docs)
        │                                              │
        └─────────────────────┬────────────────────────┘
                              │
                              ▼
                  07-automation/e2e/tests/{module}/
                    *.spec.ts  <--- test title contains TC-ID
                                                   │
                              ┌────────────────────┘
                              │
                              ▼
               [ADO enabled?]
                  YES → playwright-azure-reporter syncs results to ADO Test Plan
                  NO  → 05-test-execution/automated/{date}.md   (local report)
                              │
                              ▼
                    06-defects/ (if test.skip for known bug)
                      DEF-*.md or ADO WI reference
```

---

## Layer Definitions

### Layer 1 — Framework Core (mandatory)

Installed always. Contains:

- `qa/` directory skeleton (10 folders)
- `.github/skills/` — 8 agent skill sets (3-layer model: SKILL.md + references/)
- `00-standards/` — naming conventions, templates
- `QA-STRUCTURE-GUIDE.md`
- `.github/copilot-instructions.md` — generated pipeline sequencer
- `qa-framework.config.json` schema

### Layer 2 — Playwright Integration (opt-in)

Installed always (scaffold is always created by `init`):

- `qa/07-automation/e2e/playwright.config.ts`
- `qa/07-automation/e2e/global-setup.ts`
- `qa/07-automation/e2e/.env.example`
- `qa/07-automation/e2e/fixtures/auth.ts`
- `qa/07-automation/e2e/fixtures/test-helpers.ts`
- `qa/07-automation/e2e/package.json`
- `qa/07-automation/integration/README.md` (placeholder)
- `qa/07-automation/load/README.md` (placeholder)

### Layer 3 — Azure DevOps Integration (opt-in)

Installed when `integrations.azureDevOps.enabled = true`:

- `qa/08-azure-integration/` structure
- `module-registry.json` template
- `ado-ids-mapping.json` template
- PowerShell scripts (inject, create-plan, sync)
- Azure Pipeline YAML template

---

## Configuration Architecture

```
qa-framework.config.json  (project-level, committed to repo)
        │
        ├── project.*           → Display values, URLs (non-secret)
        ├── modules[]           → Module codes, paths, ADO IDs
        ├── conventions.*       → Naming patterns, TC ID format
        ├── testUsers[]         → Role→envVar mapping (NOT credentials)
        └── integrations.*      → Feature flags + integration config
                │
                └── credentials come from:
                      .env  (local, gitignored)
                      CI variable group (qa-secrets)  [ADO only]
```

---

## Versioning Strategy

The framework uses **Semantic Versioning**:

| Change type | Version bump |
|---|---|
| New folder added to `qa/` tree or restructured | MAJOR |
| New template file | MINOR |
| New integration adapter | MINOR |
| New skill or skill update | MINOR |
| CLI command update | PATCH |
| Documentation correction | PATCH |

**Upgrade path**: When a new MAJOR version changes the `qa/` structure, the `MIGRATION-NOTES.md` in the package provides a step-by-step migration script. Projects should pin their framework version in `package.json` and upgrade deliberately.

---

## Naming Convention Rules (summary)

Full rules: [docs/folder-structure-guide.md](folder-structure-guide.md)

| Artifact | Pattern | Example |
|---|---|---|
| Folders | kebab-case | `module-operacion/` |
| Numbered QA folders | `NN-name/` | `01-specifications/` |
| Numbered spec files | `NN-name.md` | `00-inventory.md` |
| Test case IDs | `TC-{MODULE}-{SUBMODULE}-{NUM}` | `TC-OPER-CAT-001` |
| Business rule IDs | `RN-{MODULE}-{NUM}` | `RN-OPER-001` |
| Workflow IDs | `FL-{MODULE}-{NUM}` | `FL-OPER-001` |
| Defect IDs | `DEF-{NUM}` | `DEF-001` |
| Execution folders | `YYYY-MM-DD_HH-MM-SS_desc` | `2026-03-04_14-00-00_sprint40-p0` |
| Test title (no ADO) | `[TC-ID] Title @Pp` | `[TC-OPER-CAT-001] Access catalog @P0` |
| Test title (with ADO) | `[ADO_WI_ID] Title @Pp` | `[22957] Access catalog @P0` |
| Screenshot | `NN-description.png` in `diagnosis/` | `01-login-failure.png` |

---

## Assumptions

1. The primary test runner is Playwright. Other runners (Jest, Cypress) are not excluded but are not provided adapters in v1.0.
2. The target application runs in a browser. Back-end API-only testing is not the primary use case of this framework (though API testing can be added to `07-automation/` as needed).
3. The IDE agent is GitHub Copilot or equivalent. The instructions are written in Markdown and are IDE-agnostic.
4. The project uses Git. The `qa/` directory lives inside the same repository as the application code (monorepo-friendly).
5. Credentials are always managed via environment variables. There is no fallback to hardcoded credentials in any framework file.
