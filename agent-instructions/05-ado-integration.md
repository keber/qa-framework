# Agent Instructions: Azure DevOps Integration

> ⚠️ **DEPRECATED**: This file is superseded by `.github/skills/qa-ado-integration/SKILL.md`.
> Kept as reference during the transition period. Do not update this file.

**File**: `agent-instructions/05-ado-integration.md`  
**Purpose**: Instructions for an agent to create, configure, and maintain Azure DevOps Test Plans integration with Playwright automation results.

> **This section is OPTIONAL**. Only use it when `integrations.azureDevOps.enabled = true` in `qa-framework.config.json`.

---

## Prerequisites

1. Azure DevOps PAT stored in `ADO_PAT` environment variable  
   Required scopes: `Work Items (Read, Write)`, `Test Management (Read, Write)`
2. `ADO_ORG` and `ADO_PROJECT` environment variables set
3. PowerShell 5.1+ available
4. `@alex_neo/playwright-azure-reporter` installed in the E2E package
5. `qa/08-azure-integration/module-registry.json` exists with module paths and plan IDs

---

## Step 1: Create ADO Test Plan

If no Test Plan exists yet:

```powershell
# qa/08-azure-integration/scripts/create-testplan-from-mapping.ps1
# Reads ado-ids-mapping-{project}.json and creates the plan + suites + TCs in ADO
# Parameters: -Organization $env:ADO_ORG -Project $env:ADO_PROJECT -Token $env:ADO_PAT
.\qa\08-azure-integration\scripts\create-testplan-from-mapping.ps1 `
  -Organization $env:ADO_ORG `
  -Project $env:ADO_PROJECT `
  -Token $env:ADO_PAT `
  -MappingFile .\qa\08-azure-integration\ado-ids-mapping-{project}.json
```

After running, the script outputs a `TestPlanId` and `SuiteIds`.  
Record these in `qa/08-azure-integration/module-registry.json`.

---

## Step 2: Inject ADO IDs into Spec Files

Once Test Cases are created in ADO and have Work Item IDs:

```powershell
# Dry run first to preview changes
.\qa\08-azure-integration\scripts\inject-ado-ids.ps1 `
  -MappingFile .\qa\08-azure-integration\ado-ids-mapping-{project}.json `
  -TestDir .\qa\07-automation\e2e\tests `
  -DryRun

# Apply changes
.\qa\08-azure-integration\scripts\inject-ado-ids.ps1 `
  -MappingFile .\qa\08-azure-integration\ado-ids-mapping-{project}.json `
  -TestDir .\qa\07-automation\e2e\tests
```

This converts test titles from:
```
'[TC-OPER-CAT-001] Access catalog list @P0'
```
to:
```
'[22957] Access catalog list @P0'
```

Plus adds annotation:
```typescript
test.info().annotations.push({ type: 'TestCase', description: '22957' });
```

---

## Step 3: Configure playwright-azure-reporter

In `playwright.config.ts`:

```typescript
import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  reporter: [
    ['html'],
    ['@alex_neo/playwright-azure-reporter', {
      orgUrl: `https://dev.azure.com/${process.env.ADO_ORG}`,
      token: process.env.ADO_PAT,
      planId: Number(process.env.ADO_PLAN_ID),
      projectName: process.env.ADO_PROJECT,
      isDisabled: !process.env.CI,                    // only publish in CI
      publishTestResultsMode: 'testRun',
      testRunTitle: `QA Run - ${new Date().toISOString()}`,
      uploadAttachments: true,
      attachmentsType: ['screenshot', 'video', 'trace'],
    }],
  ],
};
export default config;
```

**Note**: Set `isDisabled: !process.env.CI` so the reporter only publishes from CI, not from local runs.

---

## Step 4: Module Registry

Maintain `qa/08-azure-integration/module-registry.json`:

```json
{
  "modules": [
    {
      "name": "operacion",
      "specsPath": "qa/07-automation/e2e/tests/operacion",
      "planId": 0,
      "suiteId": 0,
      "description": "Módulo Operación — 7 submodules"
    }
  ]
}
```

The CI pipeline uses this file to detect which module changed (via `git diff`) and run only the relevant spec.

---

## Step 5: ADO IDs Mapping File

Maintain `qa/08-azure-integration/ado-ids-mapping-{project}.json`:

```json
{
  "planId": 22304,
  "module": "operacion",
  "specsPath": "qa/07-automation/e2e/tests/operacion",
  "suites": [
    {
      "suiteId": 22956,
      "suiteName": "Suite 1.1 - Catálogos de Trabajo",
      "testCases": [
        { "id": 22957, "title": "Access catalog list @P0", "tags": ["automatable", "playwright"] },
        { "id": 22958, "title": "Create labor type @P1", "tags": ["automatable", "playwright"] }
      ]
    }
  ]
}
```

---

## Step 6: Configure CI Pipeline

Template in `qa/08-azure-integration/pipelines/azure-pipeline-qa.yml`:

```yaml
trigger:
  branches:
    include:
      - {{CI_TRIGGER_BRANCH}}

pool:
  vmImage: 'ubuntu-latest'

variables:
  - group: qa-secrets        # Must contain: QA_USER_EMAIL, QA_USER_PASSWORD, QA_BASE_URL, ADO_PAT

steps:
  - checkout: self
    fetchDepth: 2

  - task: NodeTool@0
    inputs:
      versionSpec: '20.x'
    displayName: 'Install Node.js 20'

  - script: |
      cd qa/07-automation/e2e
      npm install
      npx playwright install chromium --with-deps
    displayName: 'Install Playwright'

  - script: |
      cd qa/07-automation/e2e
      npx playwright test
    displayName: 'Run Playwright tests'
    env:
      QA_BASE_URL: $(QA_BASE_URL)
      QA_USER_EMAIL: $(QA_USER_EMAIL)
      QA_USER_PASSWORD: $(QA_USER_PASSWORD)
      ADO_PAT: $(ADO_PAT)
      ADO_PLAN_ID: $(ADO_PLAN_ID)
      CI: 'true'

  - task: PublishTestResults@2
    inputs:
      testResultsFormat: 'JUnit'
      testResultsFiles: '**/test-results/*.xml'
    displayName: 'Publish JUnit results'
    condition: always()

  - task: PublishPipelineArtifact@1
    inputs:
      targetPath: 'qa/07-automation/e2e/playwright-report'
      artifact: 'playwright-html-report'
    displayName: 'Publish HTML report'
    condition: always()
```

---

## Syncing ADO TC Titles with Spec Titles

If TC titles drift between ADO and the spec files:

```powershell
.\qa\08-azure-integration\scripts\sync-ado-titles.ps1 `
  -Organization $env:ADO_ORG `
  -Project $env:ADO_PROJECT `
  -Token $env:ADO_PAT `
  -MappingFile .\qa\08-azure-integration\ado-ids-mapping-{project}.json `
  -DryRun
```

This reads ADO TC titles and compares them against the spec. Outputs a diff report. Apply with `-DryRun:$false`.

---

## Credential Security Rules for ADO

1. `ADO_PAT` is **never** committed to any file — always comes from env var or CI variable group
2. `ADO_PAT` is **never** logged, printed, or written to any markdown file
3. If a PAT appears in any log or output, revoke it immediately in ADO Portal and generate a new one
4. Variable group `qa-secrets` in Azure DevOps must be scoped to the pipeline only
5. PAT minimum scopes: `Work Items (Read, Write)`, `Test Management (Read, Write)` — do not use full access PATs

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Reporter silently does nothing in CI | `isDisabled: true` or `CI` env not set | Verify `process.env.CI` is `'true'` in pipeline |
| Tests report as "Not Run" in ADO | ADO WI ID not in test title or annotation | Re-run `inject-ado-ids.ps1` |
| TestRun created but no results attached | `publishTestResultsMode` wrong | Use `'testRun'` not `'testCase'` |
| PAT error 401 | PAT expired or wrong scopes | Generate new PAT with correct scopes |
