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
**Prerequisite**: ADO configuration in `qa/qa-framework.config.json`; valid `ADO_PAT` env var  
**Output**: ADO Test Plan populated + `qa/08-azure-integration/module-registry.json` updated  
**Use any time** after Stage 4 (Test Cases) or Stage 5 (Automation) are ready to sync

> **Credential rule**: NEVER hardcode PAT, username, or organization URL in any file. Always read from env vars or `<PLACEHOLDER>` in documentation.

---

## Inputs Required

1. `qa/qa-framework.config.json` — ADO org URL, project name, test plan ID (or "create new")
2. `qa/03-test-cases/automated/` — TC files with IDs to sync
3. `ADO_PAT` environment variable — personal access token with Test Plans read/write
4. Optionally: `qa/08-azure-integration/module-registry.json` for existing ID mapping

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

### Step 3 — Sync test cases

Use `inject-ado-ids.ps1` to push TCs to ADO and write the returned ADO test case IDs back into local TC files.

After sync, each TC file must have `adoId: <NNN>` in its YAML frontmatter block.

### Step 4 — Configure Playwright ADO reporter

See `references/scripts-and-config.md` for the reporter config block to add to `qa/07-automation/playwright.config.ts`.

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
- `qa/07-automation/playwright.config.ts` updated with reporter config
