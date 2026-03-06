# docs/generalization-decisions.md

**Phase 2 Artifact** — Classification and decision log for every element found during discovery.

Every decision in this document follows the format:

> **Decision ID** | **Item** | **Source** | **Decision** | **Rationale** | **What was discarded**

---

## §1 — 8-Folder QA Directory Structure

- **Item**: Numbered folder hierarchy `00-guides/` through `08-azure-integration/`
- **Source**: Both repos (identical structure)
- **Decision**: ✅ **Framework core**
- **Rationale**: Both repos independently converged on this same structure. It provides a clear, numbered namespace that agents can navigate predictably. The numbers prevent alphabetical re-ordering from breaking conventions.
- **What was discarded**: Nothing. Structure adopted as-is.

---

## §2 — 6-File Submodule Template Set

- **Item**: `00-inventory.md` → `05-test-scenarios.md`
- **Source**: Both repos (Repo B more consistently follows the pattern)
- **Decision**: ✅ **Framework core** (reusable template)
- **Rationale**: This is the most consistently-replicated pattern across both repos and the most clearly generalizable unit of work. Every submodule follows this structure regardless of domain.
- **Naming difference**: Repo A names file 1 `01-business-rules.md`; Repo B sometimes uses `01-functional-analysis.md`. **Resolution**: Standardize as `01-business-rules.md`. Functional analysis is a technique to produce business rules, not the output itself.
- **What was discarded**: `01-functional-analysis.md` naming variant.

---

## §3 — Agent Instructions: Module Analysis

- **Item**: `AGENT-INSTRUCTIONS-MODULE-ANALYSIS.md` — 766 lines (A), 834 lines (B)
- **Source**: Both repos (conceptually identical, slightly different phrasings)
- **Decision**: ✅ **Agent instructions** (generalized, project-specific refs removed)
- **Rationale**: Both are 4-phase instructions (Prepare → Explore → Document → Review). The core process is identical. Project-specific items removed: hardcoded URLs, project names, session names.
- **What was discarded**:
  - Repo A: `https://redactedURL.com`, `redacted@mail.com`, `playwright-cli MCP tool reference`
  - Repo B: `https://redactedURL.com`, `redacted-project` session name
  - Replaced with: `{{QA_BASE_URL}}`, `{{QA_USER_EMAIL}}` placeholders
- **Adopted from Repo B** (merged): TC origin classification (UI-OBSERVADO / PENDIENTE-CODE / BLOQUEADO-PERMISOS), 50–85 TC target per submodule, 3-condition TC validity rule (VISIBLE + ACCESIBLE + OBSERVABLE)

---

## §4 — Agent Instructions: E2E Automation

- **Item**: `AGENT-INSTRUCTIONS-E2E-PLAYWRIGHT-SPRINT40.md` (Repo A only)
- **Source**: Repo A — sprint-specific, 961 lines
- **Decision**: ✅ **Agent instructions** + **Optional integration** (heavily refactored)
- **Rationale**: The document contains highly valuable generalizable patterns (multi-role auth, EXEC_IDX date strategy, 3-layer email validation, skip+DEF pattern, storageState) embedded within Sprint 40-specific content. The generalizable patterns were extracted; the sprint-specific content (task IDs, routes, form selectors) was discarded.
- **What was discarded**: Azure Task IDs (20111, 21944–21949, 20528–20529), all `/RCL/`, `/Seguridad/` route references, all Sprint 40 test counts and scope, specific ADO Plan/Suite IDs.
- **What was extracted**: The 18-section structure was collapsed into a generalized `04-automation-generation.md` agent instruction with parameterized sections.

---

## §5 — Standards Folder (`00-standards/`)

- **Item**: Naming conventions, bug template, TC template, test-data guidelines
- **Source**: Repo B only
- **Decision**: ✅ **Framework core** — adopt from Repo B as the baseline
- **Rationale**: Repo B has a full and well-designed standards set absent from Repo A. These are fully generalizable with minor parameterization (module/submodule codes).
- **What was discarded**:
  - Repo B has `admin.qakeber.com` hardcoded in bug-report template and test-data guidelines. Replaced with `{{QA_ADMIN_EMAIL}}`.
  - Module codes (AUTH, PERS, USER, AGRI, OPER, REP) were kept as example values in templates but removed from any "authoritative" list.

---

## §6 — Playwright Integration

- **Item**: `playwright.config.ts`, `global-setup.ts`, `.env.example`, `fixtures/auth.ts`, page objects, spec files
- **Source**: Both repos
- **Decision**: ✅ **Optional integration** (playwright adapter) + ✅ **Reusable templates** for config files
- **Rationale**: Playwright is the automation framework of choice in both repos but must remain optional. Projects may use a different test runner (Jest, Cypress). The configuration patterns (storageState, globalSetup, testIgnore for seeds, CI vs local workers) are generalizable as templates.
- **What was discarded**:
  - All project-specific selectors (form fields, route paths, element IDs)
  - All hardcoded URLs
  - Sprint-specific npm scripts (`sprint40`, `sprint40:p0`)
  - Application-specific form constants from `fixtures/test-data.ts`
  - All page objects (too application-specific)
- **What was templated**:
  - `playwright.config.ts` — with `{{...}}` placeholders for baseURL, test path, ADO credentials
  - `global-setup.ts` — generic login flow with configurable selectors
  - `.env.example` — with all credential variables documented
  - `fixtures/auth.ts` — generic multi-role fixture

---

## §7 — `06-defects/` Directory

**This is the evaluation specifically requested in the brief.**

- **Item**: The `06-defects/` folder and its defect-tracking purpose
- **Source**: Repo A (actively used: DEF-001, DEF-002), Repo B (folder exists, no files)
- **Analysis**:

  | Criteria | Finding |
  |---|---|
  | Is real value demonstrated? | Yes, in Repo A: DEF-* IDs are referenced from `test.skip()`, linking automation state to bug state. This provides traceability from failing test → known defect. |
  | Is it redundant with ADO? | Partially. ADO Work Items serve the same purpose in organizations that use ADO. However, not all projects use ADO. |
  | Is the format standardized? | No. In Repo A: freeform Markdown. Repo B has a bug-report template in `00-standards/`. |
  | Does it create maintenance burden? | Yes, if not kept in sync with ADO. Two sources of truth for defects is a known anti-pattern. |

- **Decision**: ✅ **Keep as optional** — not required by framework core, but recommended when:
  1. ADO is not in use (lightweight alternative)
  2. The project needs offline/local defect tracking during sprint stabilization
  3. The team wants to document the `test.skip() → DEF-* → reactivation path` explicitly

- **Recommended evolution**: When ADO is enabled, `06-defects/` becomes a cache/mirror of ADO bugs relevant to QA automation. The defect file links to the ADO WI, rather than replacing it.

- **What would be removed**: If this folder is removed from a project, the `test.skip('DEF-XXX: ...')` convention should still be kept in spec files; the DEF ID should then reference the ADO WI ID directly.

---

## §8 — Azure DevOps Integration

- **Item**: Pipeline YAML, `playwright-azure-reporter`, PowerShell scripts, `module-registry.json`, `ado-ids-mapping.json`
- **Source**: Repo B (fully implemented), Repo A (partial — referenced but not implemented)
- **Decision**: ✅ **Optional integration** (ado-powershell adapter + playwright-azure-reporter adapter)
- **Rationale**: ADO integration provides real value (E2E result sync with Test Plans, CI pipeline, WI ID injection) but creates a strong dependency on a specific vendor (Azure DevOps). The framework must work without it.
- **What was kept**: The full set of scripts from Repo B — `inject-ado-ids.ps1`, `create-testplan-from-mapping.ps1`, `sync-ado-titles.ps1` — generalized by removing hardcoded org/project/ID values.
- **What was parameterized**: `ADO_ORG`, `ADO_PROJECT`, `ADO_PAT`, `planId`, `suiteId`, variable group name.
- **What was marked as stub**: The Repo B pipeline references a specific trigger branch (`keber.flores/qa-test/qa-specs`). This is replaced with a parameterized `{{CI_TRIGGER_BRANCH}}` in the template.

---

## §9 — Blazor-Specific Automation Guides

- **Item**: `BLAZOR_WASM_AUTOMATION.md`, `RADZEN_COMPONENTS_PLAYWRIGHT.md`, `RETROSPECTIVA_CASCADA_2026-02.md`
- **Source**: Repo B only
- **Decision**: ✅ **Optional integration** (blazor-radzen adapter) for reusable helper functions; ❌ **Out of framework** for retrospective
- **Rationale**: The Blazor/Radzen automation patterns (`openDropdownAndSelectFirst()`, `toBeAttached()`, `waitForFunction()` for popup detection) are highly reusable across any Radzen Blazor project. However, they are not generic enough for the framework core. The retrospective is project-specific debug log.
- **What was extracted**: `openDropdownAndSelectFirst()` function moved to `integrations/blazor-radzen/helpers.ts` (stub — marked as `ADAPTER`).
- **What was discarded**: Retrospective content, specific route references in cascade-dropdown backtrack.

---

## §10 — EXEC_IDX / RUN_SLOT Date Generation Pattern

- **Item**: `Math.floor(Date.now() / 60_000) % 100_000` (EXEC_IDX), `Math.floor(Date.now()/300_000)` (RUN_SLOT)
- **Source**: Repo A (primary), Repo B (uses raw `Date.now()` without the slot pattern)
- **Decision**: ✅ **Framework core** (general convention, extracted to template)
- **Rationale**: This pattern solves a real cross-project problem: parallel or repeated test runs creating data collisions. It avoids the need for test teardown and is independently applicable to any project with CRUD tests.
- **Action**: Documented in `agent-instructions/04-automation-generation.md` as a required pattern for data-producing tests. Moved to `templates/automation-scaffold/fixtures/test-helpers.ts`.

---

## §11 — Naming Convention: Test Titles

- **Item**: Test title format — `[Nx] Title @Pp` (Repo A) vs `[ADO_ID] Title` (Repo B)
- **Source**: Both repos, incompatible
- **Decision**: ✅ **Framework core** (adopt unified convention)
- **Unified convention**: `[{LOCAL_ID}] {title} @{priority}` — e.g. `[TC-OPER-CAT-001] Access catalog list @P0`
- **When ADO is enabled**: Local ID is replaced with ADO WI ID by `inject-ado-ids.ps1`, becoming `[22957] Access catalog list @P0`
- **Rationale**: The local ID format preserves traceability without requiring ADO. The ADO ID injection is an idempotent upgrade step, not a prerequisite.

---

## §12 — Page Object Model (POM) vs Inline Automation

- **Item**: POMs (Repo A) vs inline selector logic (Repo B)
- **Source**: Repo A has 5 POMs; Repo B uses inline `page.locator()` calls in spec files
- **Decision**: ✅ **Framework recommendation: use POMs** for production automation; inline is acceptable for exploratory scripts
- **Rationale**: POMs provide selector encapsulation and reuse across suites. Repo A's approach led to smaller spec files and easier maintenance. Repo B's inline approach was faster to write but led to selector duplication. The framework templates use POMs, but the agent instruction notes that inline is acceptable for single-use diagnostic specs.

---

## §13 — `SITEMAP_TERRAVIX_QA.md` / `ui-menu-map.md` Pattern

- **Item**: Auto-generated application sitemap from a real Playwright session
- **Source**: Both repos (Repo B: SITEMAP file, Repo A: auto-generated ui-menu-map.md)
- **Decision**: ✅ **Reusable template** — the `ui-menu-map.spec.ts` script extracted and generalized
- **Rationale**: Generating a live sitemap from a Playwright session is a highly valuable, universally applicable pattern. It provides the ground truth for module analysis and access-control testing.
- **What was parameterized**: `BASE_URL` env var, output path in `qa/01-specifications/shared/ui-menu-map.md`.

---

## §14 — Session Summary Pattern

- **Item**: `SESSION-SUMMARY-YYYY-MM-DD.md` files at qa/ root (Repo B)
- **Source**: Repo B only
- **Decision**: ✅ **Reusable template**
- **Rationale**: Provides a living log of what was produced in each QA working session. Useful for agent continuity (can resume from a known state) and for traceability.
- **What was discarded**: Specific content (Personas module, 19 files created, etc.)

---

## §15 — `06-defects/` vs ADO Work Items Decision Tree

For completeness, here is the recommended decision tree:

```
Is Azure DevOps enabled in this project?
├── YES → Use ADO Work Items for ALL defects.
│         Keep 06-defects/ as a lightweight reference cache only.
│         Each DEF-*.md file = summary + link to ADO WI URL.
│         test.skip() references ADO WI ID, not DEF-ID.
│
└── NO  → Use 06-defects/ as the primary defect tracker.
          Follow the bug-report-template.md format.
          test.skip() references DEF-ID.
          When ADO is enabled later: migrate IDs.
```
