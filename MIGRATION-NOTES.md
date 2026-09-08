# Migration Notes

How to migrate an existing project's embedded QA artifacts to `keber/qa-framework`.

---

## Overview

Both source repositories (`redacted-repo-web` and `redacted-repo`) were designed
with QA embedded directly in the project repository. This document describes how to migrate
each pattern to the decoupled package approach.

---

## Pattern A - Repo A style (redacted-repo-web)

### Characteristics

- QA lives under `qa/` inside the main project repo
- No `00-standards/` folder
- No `08-azure-integration/` folder
- Uses `gmoindustrial-qa-e2e` package name (private, not published)
- Login: RUT-based auth, custom selectors
- ADO referenced (Plan 21992) but not fully integrated via reporter

### Migration steps

1. **Install the framework** (choose Option A or B from `docs/installation.md`):
   ```bash
   npm install --save-dev keber/qa-framework
   ```

2. **Create config file** at project root:
   ```bash
   npx keber/qa-framework init
   ```
   Edit `qa-framework.config.json`:
   ```json
   {
     "project": { "name": "GMO Industrial", "key": "GMO-IND" },
     "conventions": { "qaRoot": "qa" },
     "integrations": {
       "playwright": { "configPath": "qa/07-automation/playwright.config.ts" },
       "azureDevOps": { "enabled": false }
     }
   }
   ```

3. **Update `.env` file** (copy `.env.example` from scaffold):
   ```
   QA_BASE_URL=https://your-gmo-ind.qa.example.com
   QA_LOGIN_PATH=/Seguridad/Login
   QA_LOGIN_EMAIL_SELECTOR=#m_login_username
   QA_LOGIN_PASSWORD_SELECTOR=#m_login_password
   QA_LOGIN_SUBMIT_SELECTOR=#m_login_signin_submit
   QA_LOGIN_SUCCESS_SELECTOR=.m-header
   QA_USER_EMAIL=your-rut@example.com
   QA_USER_PASSWORD=CHANGE_ME
   ```
   > For RUT-based login: the `QA_LOGIN_EMAIL_SELECTOR` should point to the RUT input field.

4. **Move existing spec files** (no structural changes needed):
   ```
   qa/07-automation/e2e/          <- keep your existing .spec.ts files here
   ```

5. **Add missing standard folders**:
   ```bash
   mkdir qa/00-standards
   ```
   Copy the standards templates:
   - `node_modules/keber/qa-framework/templates/defect-report.md`
     -> `qa/00-standards/bug-report-template.md`

6. **Update `package.json` in `qa/07-automation/`**:
   Replace the existing `gmoindustrial-qa-e2e` package name with your project name.
   The scripts can remain the same.

7. **Add `06-defects/`** (optional but recommended when ADO not integrated):
   ```bash
   mkdir -p qa/06-defects/open qa/06-defects/resolved
   ```
   Move existing DEF-001.md and DEF-002.md to `qa/06-defects/open/`.

8. **Validate**:
   ```bash
   npx keber/qa-framework validate
   ```

---

## Pattern B - Repo B style (redacted-repo)

### Characteristics

- QA lives under `qa/` inside the main project repo
- Has `00-standards/` with naming-conventions, bug-template, TC-template, test-data-guidelines
- Has `08-azure-integration/` with playwright-azure-reporter, inject-ado-ids.ps1, module-registry.json
- Multi-module structure: 4 modules × 17+ submodules
- Full ADO integration: Plans 22304/22794/22875, WI IDs 22957-23034
- Login: email-based auth

### Migration steps

1. **Install the framework**:
   ```bash
   npm install --save-dev keber/qa-framework
   ```

2. **Create config file** preserving existing module structure:
   ```json
   {
     "project": { "name": "GMOs", "key": "GMOS" },
     "modules": [
       {
         "name": "Facturas",
         "key": "FAC",
         "adoSuiteId": 22794,
         "submodules": [
           { "name": "Crear Factura",  "key": "cr" },
           { "name": "Listar",         "key": "ls" }
         ]
       }
     ],
     "integrations": {
       "azureDevOps": {
         "enabled": true,
         "orgUrl": "https://dev.azure.com/your-org",
         "projectName": "YourProject",
         "planId": 22304
       }
     }
   }
   ```

3. **Keep existing `00-standards/` files** - they are compliant with the framework.
   The framework's `templates/defect-report.md` is a generalization of the existing
   bug-report template; no changes required.

4. **Keep existing `08-azure-integration/` files**:
   - `module-registry.json` - compatible as-is
   - Replace `inject-ado-ids.ps1` with the generalized version from
     `node_modules/keber/qa-framework/integrations/ado-powershell/scripts/inject-ado-ids.ps1`
     (optional - existing script continues to work)

5. **Verify `.gitignore`** contains:
   ```
   qa/07-automation/.env
   qa/07-automation/.auth/
   qa/07-automation/node_modules/
   qa/07-automation/playwright-report/
   qa/07-automation/test-results/
   ```

6. **Validate**:
   ```bash
   npx keber/qa-framework validate --strict
   ```

---

## Notes on backward compatibility

- **TC IDs**: The framework uses `[TC-MODULE-SUB-NNN]` format. Existing TCs with different
  formats (e.g., plain numbers like `[TC-001]`) can be migrated by renaming at the next
  spec refresh cycle; no immediate change required.
- **ADO WI IDs**: Already injected IDs (`[22957]` prefixes) are compatible - the reporter
  reads the numeric prefix regardless of what follows.
- **storageState files**: Existing `.auth/*.json` files are compatible with the scaffold's
  `global-setup.ts` - no migration needed.
- **Package name**: The automation sub-package (`gmoindustrial-qa-e2e` or similar) is a
  private local package; renaming is optional cosmetic change.

---

## What is NOT migrated

The following are project-specific and should remain in the project repository:

| Item | Reason |
|------|--------|
| Actual spec file content | Project-specific selectors and test data |
| `04-test-data.md` data shapes | Project-specific entities |
| ADO WI IDs in spec titles | Project-specific |
| `.env` files | Contain secrets |
| `.auth/*.json` files | Contain session tokens |
| `playwright-report/` and `test-results/` | Generated artifacts |

---

## Upgrading from a version that used `.github/copilot-instructions.md`

Versions prior to this change deployed QA agent rules directly into `.github/copilot-instructions.md`.
The framework now uses `.github/instructions/qa-framework.instructions.md` (a VS Code
`*.instructions.md` file with `applyTo: '**'`), which is framework-owned and freely
upgradeable without touching the project's custom Copilot instructions.

**`npx qa-framework upgrade` handles the migration automatically:**

| Scenario | What upgrade does |
|---|---|
| `copilot-instructions.md` has custom instructions + QA section | Removes only the QA section; custom content is preserved |
| `copilot-instructions.md` has only QA content (any version) | Deletes the file |
| `copilot-instructions.md` has no QA content | Leaves the file untouched |

The detection marker is the heading `# QA Framework Instructions`, which is consistent
across all previous versions.

---

## Native Claude Code support (no manual per-project work needed)

Previously, projects that used Claude Code instead of (or alongside) GitHub Copilot had
to hand-build their own bridge to the framework's skills and instructions - there was no
generated artifact for Claude Code at all. Two real consumer projects independently built
two incompatible solutions to the same problem (a full skill mirror with a manual sync
script in one case, hand-written thin command wrappers in the other).

`init` and `upgrade` now generate Claude Code artifacts natively, in parallel with the
Copilot ones, with no agent detection required:

- `.claude/commands/qa-{name}.md` - one thin wrapper per skill, generated dynamically from
  `.github/skills/`. Each wrapper points back at the corresponding `SKILL.md` as the single
  source of truth (`Read the full skill at .github/skills/qa-{name}/SKILL.md FIRST...`).
  Zero duplication, zero drift.
- `.claude/rules/qa-framework.md` - the same 11 agent behavior rules and pipeline table as
  `.github/instructions/qa-framework.instructions.md`, with skill references expressed as
  `/qa-{name}` slash commands. No frontmatter, so it loads unconditionally (equivalent to
  `applyTo: '**'`).

Both files are framework-owned and refreshed safely by `npx qa-framework upgrade`, the
same way the Copilot artifacts are. Projects that built a manual bridge to Claude Code
before this version can retire it (custom sync scripts, hand-copied skill mirrors, or
hand-translated `CLAUDE.md`/`.claude/rules/` content) and rely on the generated artifacts
instead.

---

## Optional ANALISIS/PLAN sprint-cycle mode (Claude Code only)

Previously, a project that wanted a sprint-centric manual testing workflow parallel to
the 6-stage pipeline (analysis document, ADO-trace-linked test plan, chat-only QA
advisory, sprint closing results report) had to hand-build its own Claude Code
subagents - one real consumer project did exactly that, with the sprint duration,
manual-testing timebox, date format, and locale all hardcoded to its own conventions.

`init` and `upgrade` now generate this mode natively as four generic, parameterized
subagents under `.claude/agents/` (`qa-analisis.md`, `qa-plan.md`, `qa-asesoria.md`,
`qa-informe-resultados.md`), gated by `integrations.azureDevOps.sprintCycle.enabled` in
`qa-framework.config.json`. It is off by default, requires Azure DevOps integration to
be meaningful (three of the four agents consume ADO work items or an ADO execution
report), and is intentionally Claude-only - these are Claude Code subagents with
per-agent `tools`/`model` frontmatter, a primitive GitHub Copilot has no equivalent for.

Projects that hand-built this mode before this version can retire their local copy and
adopt the generated one, moving their project-specific sprint duration, manual-testing
timebox, date format, and timezone into `integrations.azureDevOps.sprintCycle` in
`qa-framework.config.json`. See [docs/usage-with-agent.md](docs/usage-with-agent.md) and
[docs/installation.md](docs/installation.md) for the full config shape and generated
file list.
