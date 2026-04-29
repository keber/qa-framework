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
- **Stage 3.5 - Test Stabilization** (`agent-instructions/04b-test-stabilization.md`) — agent
  instruction file for exhaustively reviewing and stabilizing generated Playwright tests before
  ADO integration. Covers baseline collection, failure classification (9 categories), false-positive
  validation, confidence scoring (>=90% exit threshold), `STABILIZATION-REPORT.md` schema, and
  upstream artifact update rules.

### Planned

- `qa-framework generate spec <module-name>` — scaffold a full spec set from CLI
- `qa-framework validate` — check `qa/` structure for compliance with conventions
- Integration: `jest` support alongside Playwright
- Integration: GitHub Actions pipeline template (alongside existing Azure Pipelines template)

---

