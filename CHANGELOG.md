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

## [Unreleased]

### Added

- **Stage 3.5 — Test Stabilization** (`agent-instructions/04b-test-stabilization.md`) — new agent
  instruction file for exhaustively reviewing and stabilizing generated Playwright tests before
  ADO integration. Covers baseline collection, failure classification (9 categories), false-positive
  validation, confidence scoring (≥90% exit threshold), `STABILIZATION-REPORT.md` schema, and
  upstream artifact update rules. Sits between Stage 4 (Automation Generation) and Stage 5
  (ADO Integration) and is mandatory before any CI pipeline registration.

### Planned

- `qa-framework generate spec <module-name>` — scaffold a full spec set from CLI
- `qa-framework validate` — check `qa/` structure for compliance with conventions
- `qa-framework upgrade` — migrate old embedded structure to package-based layout
- Integration: `jest` support alongside Playwright
- Integration: GitHub Actions pipeline template (alongside existing Azure Pipelines template)
