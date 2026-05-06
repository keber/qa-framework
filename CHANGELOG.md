# Changelog

All notable changes to `qa-framework` will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

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

### Source repositories

This version was bootstrapped from analysis of two existing embedded QA implementations:

- `redacted-repo` (Repo A) — ASP.NET MVC 5 + jQuery + toastr + Sprint-based E2E
- `redacted-repo` (Repo B) — Blazor WebAssembly + Radzen + full ADO pipeline integration

All project-specific content (URLs, ADO IDs, user credentials, module names, form selectors)
has been removed or parameterized. See `docs/comparison-matrix.md` and `docs/generalization-decisions.md`.

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

