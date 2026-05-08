---
name: qa-ado-integration
description: >
  Optional stage of the QA pipeline. Syncs test plans, test cases, and
  automation results with Azure DevOps (ADO) Test Plans. Injects ADO IDs
  back into local spec files and configures the Playwright ADO reporter.
  Use when asked to sync with Azure DevOps, push test cases to ADO, create
  a test plan in ADO, configure ADO reporting, inject ADO IDs, or link
  Playwright results to ADO.
  Requires ADO enabled in qa-framework.config.json with valid PAT in env vars.
---

# QA Skill: ADO Integration (Optional Stage)

**Stage**: Optional — ADO Integration (no pipeline order dependency)
**Prerequisite**: `Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md` exists with a complete Tabla de Pruebas (steps filled in); valid `ADO_PAT` env var
**Output**: ADO Test Plan populated with Test Suites and Test Cases (with steps) + `qa/08-azure-integration/module-registry.json` updated
**Use any time** after Stage 3 (Plan de Pruebas) is ready — Stage 4 and 5 are not required

> **Credential rule**: NEVER hardcode PAT, username, or organization URL in any file. Always read from env vars or `<PLACEHOLDER>` in documentation.
> **Steps rule**: ADO Test Cases must have steps. Do not sync TCs from a Plan de Pruebas with empty or summary-only steps — run Stage 4 first to expand them.

---

## Inputs Required

1. `qa/qa-framework.config.json` — ADO org URL, project name, test plan ID (or "create new")
2. `qa/02-test-plans/sprints/Sprint-{N}/Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md` — one file per module; each file's Tabla de Pruebas becomes one Test Suite in ADO
3. `ADO_PAT` environment variable — personal access token with Test Plans read/write
4. Optionally: `qa/08-azure-integration/module-registry.json` for existing ID mapping

> **Note**: The consolidated `Plan-de-Pruebas-{proyecto}-Sprint-{N}.md` (without module suffix)
> is for human reference only — do not use it as input for ADO scripts.

---

## Process

### Step 1 — Verify ADO config

Check `qa/qa-framework.config.json` for:
```json
"ado": {
  "org": "<ADO_ORG_URL>",
  "project": "<PROJECT_NAME>",
  "planId": <PLAN_ID_OR_NULL>
}
```
If `planId` is null, a new plan will be created in Step 2.

### Step 2 — Create or verify Test Plan

Use the PowerShell script: `integrations/ado-powershell/scripts/create-testplan-from-mapping.ps1`

See `references/scripts-and-config.md` for usage, parameters, and required env vars.

Required env vars:
- `$env:ADO_ORG` — organization URL (e.g., `https://dev.azure.com/myorg`)
- `$env:ADO_PROJECT` — project name
- `$env:ADO_PAT` — PAT token

### Step 3 — Sync test cases from Plan de Pruebas

For each `Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md` file:
1. Read the Tabla de Pruebas
2. Create one **Test Suite** in ADO named after the module (or use the suite groupings from section 5 of the plan)
3. For each row in the table, create one **Test Case** with:
   - Title: the Título column value
   - Steps: the Steps column value (numbered steps, `<br>`-separated → each becomes one ADO step)
   - Expected result: the Resultado Esperado column value
   - Tags: Tipo + Prioridad values
4. Write the returned ADO Test Case IDs back into the table (column "ADO WI") and into `module-registry.json`

Use `inject-ado-ids.ps1` to automate the create + inject cycle.

After sync, each row in the Plan de Pruebas table must have an ADO WI ID.

### Step 4 — Configure Playwright ADO reporter

See `references/scripts-and-config.md` for the reporter config block to add to `qa/07-automation/e2e/playwright.config.ts`.

Required fields:
- `orgUrl`, `projectName`, `planId`, `runName`
- All values must come from environment variables — no hardcoded IDs

### Step 5 — Run sync and validate

Run `sync-ado-titles.ps1` after automation runs to update ADO test outcomes from Playwright report JSON.

### Step 6 — Update registry

Update `qa/08-azure-integration/module-registry.json` with:
- Module name
- ADO Plan ID
- ADO Suite IDs per submodule
- Sync date

---

## Troubleshooting Quick Reference

| Symptom | Likely cause | Fix |
|---|---|---|
| 401 Unauthorized | Expired or wrong PAT | Regenerate PAT; check `$env:ADO_PAT` |
| Plan not found | Wrong planId in config | Verify planId or set to null to create new |
| TCs not appearing | Wrong suite parent ID | Check `module-registry.json` suite mapping |
| Reporter not posting | Missing env var at runtime | Pass vars via CI pipeline or `.env` |
| Duplicate TCs | Re-ran create script | Use `inject-ado-ids.ps1` idempotently |

---

## Outputs

- ADO Test Plan populated with test cases
- `qa/03-test-cases/automated/TC-*.md` — ADO IDs injected
- `qa/08-azure-integration/module-registry.json` updated
- `qa/07-automation/e2e/playwright.config.ts` updated with reporter config
