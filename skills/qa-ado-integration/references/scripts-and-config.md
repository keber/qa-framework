# Reference: ADO Scripts and Configuration

> Loaded by `skills/qa-ado-integration/` for PowerShell scripts, reporter config, and CI pipeline.

---

## PowerShell Scripts Usage

### create-testplan-from-mapping.ps1

Creates a new ADO Test Plan with suites and test cases from the mapping JSON file.

```powershell
.\integrations\ado-powershell\scripts\create-testplan-from-mapping.ps1 `
  -Organization $env:ADO_ORG `
  -Project $env:ADO_PROJECT `
  -Token $env:ADO_PAT `
  -MappingFile .\qa\08-azure-integration\ado-ids-mapping-{project}.json
```

Output: `TestPlanId` and `SuiteIds` — record in `module-registry.json`.

---

### inject-ado-ids.ps1

Injects ADO Work Item IDs into Playwright test titles and adds ADO annotations.

```powershell
# Dry run first
.\integrations\ado-powershell\scripts\inject-ado-ids.ps1 `
  -MappingFile .\qa\08-azure-integration\ado-ids-mapping-{project}.json `
  -TestDir .\qa\07-automation\e2e\tests `
  -DryRun

# Apply
.\integrations\ado-powershell\scripts\inject-ado-ids.ps1 `
  -MappingFile .\qa\08-azure-integration\ado-ids-mapping-{project}.json `
  -TestDir .\qa\07-automation\e2e\tests
```

Transforms test titles:
```
# Before
'[TC-OPER-CAT-001] Access catalog list @P0'

# After
'[22957] Access catalog list @P0'
```

Adds annotation:
```typescript
test.info().annotations.push({ type: 'TestCase', description: '22957' });
```

---

### sync-ado-titles.ps1

Syncs ADO TC titles with local spec file titles (detects drift):

```powershell
.\integrations\ado-powershell\scripts\sync-ado-titles.ps1 `
  -Organization $env:ADO_ORG `
  -Project $env:ADO_PROJECT `
  -Token $env:ADO_PAT `
  -MappingFile .\qa\08-azure-integration\ado-ids-mapping-{project}.json `
  -DryRun
```

Apply with `-DryRun:$false`.

---

## ADO IDs Mapping File

```json
{
  "planId": 22304,
  "module": "operacion",
  "specsPath": "qa/07-automation/e2e/tests/operacion",
  "suites": [
    {
      "suiteId": 22956,
      "suiteName": "Suite 1.1 - {Submodule Name}",
      "testCases": [
        { "id": 22957, "title": "Access catalog list @P0", "tags": ["automatable", "playwright"] },
        { "id": 22958, "title": "Create labor type @P1", "tags": ["automatable", "playwright"] }
      ]
    }
  ]
}
```

---

## Module Registry

```json
{
  "modules": [
    {
      "name": "{module-kebab}",
      "specsPath": "qa/07-automation/e2e/tests/{module-kebab}",
      "planId": 0,
      "suiteId": 0,
      "description": "{Module display name} — {N} submodules"
    }
  ]
}
```

---

## playwright-azure-reporter Config

Add to `qa/07-automation/playwright.config.ts` reporter array:

```typescript
['@alex_neo/playwright-azure-reporter', {
  orgUrl: `https://dev.azure.com/${process.env.ADO_ORG}`,
  token: process.env.ADO_PAT,
  planId: Number(process.env.ADO_PLAN_ID),
  projectName: process.env.ADO_PROJECT,
  isDisabled: !process.env.CI,          // only publish in CI
  publishTestResultsMode: 'testRun',
  testRunTitle: `QA Run - ${new Date().toISOString()}`,
  uploadAttachments: true,
  attachmentsType: ['screenshot', 'video', 'trace'],
}]
```

**`isDisabled: !process.env.CI`** — prevents publishing from local developer runs.

---

## CI Pipeline Template

```yaml
trigger:
  branches:
    include:
      - {{CI_TRIGGER_BRANCH}}

pool:
  vmImage: 'ubuntu-latest'

variables:
  - group: qa-secrets   # Must contain: QA_USER_EMAIL, QA_USER_PASSWORD, QA_BASE_URL, ADO_PAT, ADO_PLAN_ID

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

## Credential Security Rules

1. `ADO_PAT` is **never** committed to any file — always from env var or CI variable group
2. `ADO_PAT` is **never** logged, printed, or written to any markdown file
3. If a PAT appears in any log or output: revoke it immediately in ADO Portal, generate new one
4. Variable group `qa-secrets` must be scoped to the pipeline only — no project-wide access
5. PAT minimum scopes: `Work Items (Read, Write)`, `Test Management (Read, Write)` — never use full-access PATs
