# Changelog

All notable changes to `qa-framework` will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.11.0] - 2026-06-24

### Added

- **`templates/automation-scaffold/fixtures/base.ts`** — new fixture with TTL-aware session
  refresh. Replaces the plain `@playwright/test` import in long-running suites where the
  server-side session may expire before the suite finishes.
- **`templates/automation-scaffold/global-setup.ts`** — hardened login flow:
  - `resolveVar()` with source logging (`param` / `env:KEY` / `default`)
  - Login retry loop (up to 3 attempts) with crash-page detection and recovery
  - `resolveAuthUsers()` — derives which users to authenticate from `QA_AUTH_USER` env var
    or from configured `storageState` paths in `playwright.config.ts`
  - `dismissOnboardingFlow()` — configurable via `QA_DISMISS_ONBOARDING_LABELS`
    (comma-separated button labels); no-op by default
  - Support for a second test user (`.auth/user-2.json`) via `QA_USER2_EMAIL` /
    `QA_USER2_PASSWORD`
- **`templates/automation-scaffold/playwright.config.ts`** — exports `SESSION_TTL_MS`
  (default 2 h, overridable via `QA_SESSION_TTL_MS`); commented-out parallel 2-user variant
  (`chromium-user1` / `chromium-user2`).
- **`templates/automation-scaffold/.env.example`** — new variables: `QA_SESSION_TTL_MS`,
  `QA_AUTH_USER`, `QA_USER2_EMAIL`, `QA_USER2_PASSWORD`, `QA_DISMISS_ONBOARDING_LABELS`,
  `PLAYWRIGHT_SERVICE_URL`.
- **`templates/integration-scaffold/`** — new scaffold for API testing with Playwright
  `APIRequestContext`. Includes `package.json`, `playwright.config.ts`, `global-setup.ts`
  (token-based or browser-login auth), `tests/example.spec.ts`, `README.md`, `.env.example`.
  Deployed to `qa/07-automation/integration/` on `init` and `upgrade`.
- **`templates/memory/`** — three semi-guided operational memory templates:
  `ci-pipeline-findings.md`, `e2e-stabilization-patterns.md`, `data-volatility-strategies.md`.
  Seeded into `qa/memory/` on `init` and `upgrade`.
- **`qa/06-defects/disputed/`** — third defect state for cases where QA has evidence but the
  business or dev team disputes the expected behavior. Created on `init` and `upgrade`.
- **`integrations/ado-powershell/pipelines/azure-pipeline-qa.yml`** — operational hardening:
  - `suiteFilter` pipeline parameter (default `all`); auto-overridden to `all` on scheduled runs
  - Bash array (`GREP_ARGS`) for safe grep pattern expansion with bracket characters
  - `PublishTestResults@2` scoped to exact XML path instead of `**/*.xml`
  - `publishRunAttachments: false` on both E2E and API stages
  - Artifact names suffixed with `$(System.JobAttempt)` to prevent collision on retries
  - `QA_AUTH_USER` documented as commented example for the 2-job parallel model
- **`integrations/playwright/README.md`** — new section: Visual AI helper optional pattern.
- **`templates/qa-readme.md`** — new fields: `ADO Project`, `Last Run` summary table,
  `Flaky Tests` inline annotation convention.

### Changed

- **`scripts/init.js`** — `fixtures/base.ts` added to e2e scaffold copy list; integration
  scaffold replaces the `integration/README.md` placeholder; memory template files seeded
  from `templates/memory/` via `fs.readFileSync`.
- **`scripts/upgrade.js`** — integration scaffold, `disputed/` defect folder, and memory
  templates are all seeded idempotently on upgrade for existing projects.
- **`docs/folder-structure-guide.md`** — `06-defects/` updated to document `disputed/`.
- **`templates/defect-report.md`** — `Status` field extended with `Disputed` value.
- **`qa/memory/INDEX.md`** template updated to pre-populate rows for the three new memory
  template files.

---

## [1.10.0] - 2026-05-19

### Added

- **`integrations/ado-powershell/pipelines/azure-pipeline-qa.yml`** — pipeline template
  significantly expanded:
  - New **Stage 3: API Integration Tests** — separate stage for `qa/07-automation/integration`,
    with its own `PublishTestResults` and `PublishPipelineArtifact` tasks.
  - **Cross-project repository checkout** via `resources.repositories` block; each stage
    now performs an explicit `checkout: source`.
  - **Smoke test step** in the E2E stage — validates `QA_BASE_URL` is reachable via `curl`
    before running the suite.
  - **Commented placeholder** for `AzureCLI@2` login task (Playwright Workspaces / Entra ID)
    in both E2E and API stages, with `PLAYWRIGHT_SERVICE_URL` env var placeholder.
  - Optional nightly schedule block (commented out).
  - `PublishPipelineArtifact` tasks for HTML report and trace artifacts in both stages.
- **`integrations/playwright-azure-reporter/README.md`** — fully rewritten:
  - Variables split into local (PAT) vs CI/CD (`SYSTEM_ACCESSTOKEN`) sections.
  - Config snippet updated to use `ADO_ORG`, `ADO_PROJECT`, `orgUrl` constructed from
    `ADO_ORG`, and `SYSTEM_ACCESSTOKEN ?? AZURE_TOKEN` token fallback.
  - New **Playwright Workspaces reporter** section (`@azure/playwright` +
    `playwright.service.config.ts` + Entra ID authentication notes).
  - Troubleshooting table expanded with pipeline-specific `401` scenario.

### Changed

- **`azure-pipeline-qa.yml`** — variable names aligned with current conventions:
  `AZURE_TOKEN` / `ADO_ORG_URL` / `ADO_PROJECT_NAME` replaced by `ADO_ORG` / `ADO_PROJECT`;
  `ADO_PLAN_ID` split into `ADO_E2E_PLAN_ID` / `ADO_API_PLAN_ID`; `SYSTEM_ACCESSTOKEN`
  replaces PAT for ADO reporter authentication.
- **`azure-pipeline-qa.yml`** — E2E job `timeoutInMinutes` increased from 60 to 90.
- **`azure-pipeline-qa.yml`** — trigger reduced to `main` only (removed `qa` and
  `release/*` branches); trigger rationale documented in comments.
- **`azure-pipeline-qa.yml`** — E2E test run consolidated from two `@grep`-tag steps
  (P0 + P1/P2) into a single `--grep-invert "_inspect|_diag"` run with `continueOnError: true`.
- **`azure-pipeline-qa.yml`** — cache target changed from `~/.cache/ms-playwright` to
  `node_modules` per workspace; `cacheHitVar` added to both cache tasks.
- **`azure-pipeline-qa.yml`** — `pool` block moved above `variables` for readability;
  `ADO_SYNC_DISABLED` variable removed.

---

## [1.9.1] - 2026-05-15

### Added

- **`integrations/ado-powershell/scripts/md-to-tc-mapping.ps1`** — new script that parses a
  Plan-de-Pruebas markdown file and generates `tc-mapping.json`. Reads the Tabla de Pruebas
  table, detects columns dynamically, skips Bloqueado rows (PENDING-CODE), splits steps by
  `<br>`, and strips leading numbering. Supports a `-TableSection` parameter for plans with
  non-standard headings. This was previously missing from the framework, forcing agents to
  implement ad-hoc parsers in each project.

### Fixed

- **`create-testplan-from-mapping.ps1`** — removed Unicode characters that caused
  `MissingArrayIndexExpression` parser errors in PowerShell 5.1.
- **`create-testplan-from-mapping.ps1`** — added auto-load of `ado-powershell` skill when
  `New-AdoTestCase` is not yet in scope; script no longer requires manual dot-sourcing before
  invocation.
- **`create-testplan-from-mapping.ps1`** — added fallback to `$mapping.items` when
  `$mapping.testCases` is absent, for compatibility with mappings generated by older sessions.
- **`inject-ado-ids.ps1`** — fixed broken regex (`\Q...\E` is not valid PowerShell); replaced
  with `[regex]::Escape()`. Added `-AdonIdsDir` parameter to process all `ado-ids-*.json`
  files in a directory in one pass. Added `-DryRun` switch. Fixed UTF-8 encoding on write.

---

## [1.9.0] - 2026-05-15

### Changed

- **`create-testplan-from-mapping.ps1` refactored** — removed all ADO-specific logic (auth headers,
  `Invoke-RestMethod` calls, XML step construction). The script now delegates to `New-AdoTestCase`
  and `Add-AdoTestCaseToSuite` from `@keber/ado-powershell`, keeping `qa-framework` free of
  ADO implementation details. Requires `@keber/ado-powershell` ≥ 1.3.0.
- **Script parameters simplified** — `-OrgUrl`, `-ProjectName`, and `-Token` removed from
  `create-testplan-from-mapping.ps1`. Caller is responsible for loading the ADO session via
  `. .github/skills/ado-powershell/load.ps1` before invoking the script.
- **`tc-mapping.json` schema extended** — added optional `steps` (string array) and
  `expectedResult` (string) fields per test case. When present, steps are sent to ADO as
  `Microsoft.VSTS.TCM.Steps`; all steps except the last are `ActionStep`, the last is
  `ValidateStep` with `expectedResult`.
- **`qa-ado-integration` SKILL.md updated** — Step 3 now specifies exactly how to parse the
  Tabla de Pruebas columns (`Steps` split on `<br>`, strip numbering prefix) to produce
  `tc-mapping.json` with steps.

### Added

- **Guard in `create-testplan-from-mapping.ps1`** — fails fast with a clear message if
  `New-AdoTestCase` is not available (ADO session not loaded).

### Requires

- `@keber/ado-powershell` ≥ **1.3.0** — adds `$ExpectedResult` parameter to `New-AdoTestCase`
  and `ValidateStep` support in the generated TCM steps XML.

---

## [1.8.0] - 2026-05-07

### Changed

- **Pipeline Stage 3 now produces "Plan de Pruebas"** — a single document per sprint+module
  that combines test plan context (scope, strategy, preconditions, test data) with a full TC
  table including numbered steps and expected results. Replaces the previous split between a
  high-level plan and separate TC-{ID}.md files for most workflows.
- **Stage 4 (`qa-test-cases`) role redefined** — from "generate TC-{ID}.md files" to
  "expand steps in Plan de Pruebas table when Stage 3 produced summary-level steps". Standalone
  `TC-{ID}.md` files are now optional and used only for complex/reusable TCs.
- **ADO integration prerequisite updated** — `qa-ado-integration` now reads from
  `Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md` (Tabla de Pruebas) instead of
  `qa/03-test-cases/automated/`. Each module file → one ADO Test Suite; each table row → one
  ADO Test Case with steps.
- **`02-test-plans/` restructured** — from flat `automated/` and `manual/` subdirectories to
  `sprints/Sprint-{N}/` per-sprint structure. Both tracks share the same Plan de Pruebas document.

### Added

- **`templates/test-plan-sprint.md`** — new primary Plan de Pruebas template. Includes header,
  12 sections, and Tabla de Pruebas with column guide. Uses `{{PLACEHOLDERS}}` throughout.
- **`skills/qa-test-plan/references/plan-de-pruebas-template.md`** — full template with example
  table rows, steps writing conventions, priority decision tree, and automation feasibility rules.
  Replaces `references/priority-and-feasibility.md` (old file kept for reference, now legacy).
- **`upgrade` Section 6** — non-destructive migration of old `02-test-plans/` structure:
  moves `automated/` → `sprints/legacy-automated/`, `manual/` → `sprints/legacy-manual/`, and
  flat `.md` plan files → `sprints/legacy/`. Creates `03-test-cases/README.md` if missing.

### Deprecated

- **`templates/test-plan.md`** — use `templates/test-plan-sprint.md` instead.
  Old file kept for reference; contains deprecation notice at top.
- **`02-test-plans/automated/` and `02-test-plans/manual/` subdirectory convention** —
  replaced by `02-test-plans/sprints/Sprint-{N}/` per-sprint structure.

### Migration

Run `npx qa-framework upgrade`. Section 6 of the upgrade script handles the `02-test-plans/`
migration non-destructively: existing plan files are moved, not deleted.

---

## [1.7.2] - 2026-05-06

### Fixed

- **`init` no longer overwrites `qa/AGENT-NEXT-STEPS.md`** on already-initialized projects.
  The file was written with a bare `fs.writeFileSync` (no existence check), causing active sprint
  checklists to be silently replaced. Changed to `writeIfMissing` — consistent with all other
  project-owned files.

---

## [1.7.1] - 2026-05-06

### Fixed

- **Agent instructions template extracted** — `templates/qa-framework.instructions.md` is now
  the single source of truth for QA agent rules. Both `init` and `upgrade` read and interpolate
  this file instead of maintaining separate hardcoded strings, eliminating the rule divergence
  that caused `upgrade` to deploy only 7 rules instead of 11.
- `upgrade.js` — removed `buildCopilotInstructions()` function (dead code after template extraction).

---

## [1.7.0] - 2026-05-06

### Changed

- **Agent instructions moved to `.github/instructions/qa-framework.instructions.md`** — the
  framework no longer writes to `.github/copilot-instructions.md`. The new file is a VS Code
  `*.instructions.md` file with `applyTo: '**'` frontmatter, which Copilot loads automatically.
  This eliminates the conflict between framework-owned rules and project-owned custom instructions:
  both files coexist independently and the framework file is freely upgradeable.

### Added

- **`upgrade` step 2b — automatic migration of old `copilot-instructions.md`**:
  - If the file contains only QA Framework content (any previous version) → the file is deleted.
  - If the file contains custom instructions and a QA Framework section → the QA section is stripped and the custom content is preserved.
  - If the file contains no QA Framework content → the file is left untouched.
  The detection marker is the heading `# QA Framework Instructions`, consistent across all versions.

### Migration

Run `npx qa-framework upgrade`. No manual steps required.
See `MIGRATION-NOTES.md` — section "Upgrading from a version that used `.github/copilot-instructions.md`".

---

## [1.6.2] - 2026-05-05

### Added

- **`tests/helpers/debug/`** — diagnostic scripts directory created by `init` and `upgrade` inside
  `07-automation/e2e/tests/`. Scripts here are excluded from test runs via `testIgnore`.
- **`tests/seeds/`** — data seeding specs directory created by `init` and `upgrade` inside
  `07-automation/e2e/tests/`. Excluded from test runs via `testIgnore`.
- **`testIgnore`** in `playwright.config.ts` template — excludes `**/helpers/debug/**` and
  `**/seeds/**` from Playwright test discovery.
- **`upgrade` step 5e** — patches existing `playwright.config.ts` in `e2e/`: replaces
  `testDir: '.'` with `'./tests'`, injects `testIgnore` if missing, creates `helpers/debug/`
  and `seeds/` if absent.
- **Dual-Track Pipeline** section in `docs/folder-structure-guide.md` and `qa/QA-STRUCTURE-GUIDE.md`
  — documents the automation track and manual track as parallel paths sharing `01-specifications/`
  as source of truth. Includes entry point table (3 scenarios) and track selection guidance.
  Clarifies that `03-test-cases/` is the manual track artifact and `04-test-data/` is optional.

### Fixed

- `qa/QA-STRUCTURE-GUIDE.md` — removed stale reference to deleted `docs/generalization-decisions.md`
  from the `06-defects/` section.
- `README.md` — pipeline table updated with Track column; `03-test-cases/` and `04-test-data/`
  annotated as manual-track / optional in the directory tree.

---

## [1.6.0] - 2026-04-29

### Changed (breaking - automated by `upgrade`)

- **`07-automation/` restructured**: the Playwright project root moves from `07-automation/` to
  `07-automation/e2e/`. Affected files: `playwright.config.ts`, `global-setup.ts`, `package.json`,
  `.env.example`, `fixtures/`. Spec stubs move from `07-automation/e2e/{module}/` to
  `07-automation/e2e/tests/{module}/`. Run `npx qa-framework upgrade` to migrate automatically.
- `testDir` in `playwright.config.ts` template is now `'./tests'` (was `'.'`).
- `QA_DIR` in the Azure Pipeline template now points to `qa/07-automation/e2e` (was `qa/07-automation`).
- CI commands: `cd qa/07-automation/e2e && npm install && npx playwright install chromium`.

### Removed

- `agent-instructions/` directory (legacy monolithic per-task instruction files) — superseded by `skills/`
  architecture since v1.5.0. All behavior is now in `skills/*/SKILL.md` + `references/`.
- `docs/comparison-matrix.md` — superseded by `docs/skills-architecture.md`.
- `docs/generalization-decisions.md` — internal design notes; no longer relevant.

### Documentation

- `docs/architecture.md` — updated for v1.6.0: correct 07-automation/e2e/ tree, removed blazor-radzen
  stub, added `.github/skills/` and `memory/` to target project box.
- `docs/installation.md` — rewritten: correct `npm install` command, no interactive prompts, correct
  directory tree with e2e/integration/load, added `upgrade` command section.
- `docs/usage-with-agent.md` — rewritten: all `00-guides/` references replaced with `.github/skills/`,
  session workflows updated to reflect skills model, DO/DON'T list corrected (e2e/ is now correct run location).
- `README.md` — version bumped, `agent-instructions/` entry removed from package tree.

### Added

- `07-automation/integration/` — placeholder for API/integration tests (k6, JMeter, Azure Load Testing);
  created on `init` and `upgrade`.
- `07-automation/load/` — placeholder for load and performance tests; created on `init` and `upgrade`.
- **`scripts/upgrade.js` migration section 5** — detects old v1.5.x structure and relocates all
  affected files non-destructively (moves only when destination does not exist; warns on conflict).
- **Stage 5b - Test Stabilization** (`skills/qa-test-stabilization/`) — skill for exhaustively
  reviewing and stabilizing generated Playwright tests before ADO integration. Covers baseline
  collection, failure classification (9 categories), false-positive validation, confidence scoring
  (>=90% exit threshold), `STABILIZATION-REPORT.md` schema, and upstream artifact update rules.

### Planned

- `qa-framework generate spec <module-name>` — scaffold a full spec set from CLI
- `qa-framework validate` — check `qa/` structure for compliance with conventions
- Integration: `jest` support alongside Playwright
- Integration: GitHub Actions pipeline template (alongside existing Azure Pipelines template)

---

## [1.0.0] - 2026-03-04

### Added

- **Framework scaffold** — initial `qa/` directory tree with 9 numbered folders (00–08)
- **6-file submodule template set** — `00-inventory` through `05-test-scenarios`
- **Agent instructions** — 7 purpose-specific Markdown instruction files for IDE agents
- **Standards** — naming conventions, bug report template, test case template, test data guidelines
- **Automation scaffold** — generalized Playwright `playwright.config.ts`, `global-setup.ts`, `.env.example`, `fixtures/auth.ts`
- **Optional integrations** — stubs and READMEs for Playwright, `playwright-azure-reporter`, and ADO PowerShell
- **CLI entry point** — `qa-framework init`, `generate`, `validate` commands
- **Documentation** — architecture, comparison matrix, generalization decisions, installation guide, usage-with-agent guide, spec-driven philosophy, folder structure guide
- **Migration notes** — `MIGRATION-NOTES.md` for projects moving from embedded to package-based framework

---
