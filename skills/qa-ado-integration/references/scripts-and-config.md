# Reference: ADO Scripts and Configuration

> Loaded by `skills/qa-ado-integration/` for PowerShell scripts, reporter config, and CI pipeline.

---

## PowerShell Scripts Usage

### create-testplan-from-mapping.ps1

Creates ADO Test Cases from a `tc-mapping.json` file and adds them to an existing plan and
suite. It needs the `@keber/ado-powershell` helpers and an ADO session; the session is passed
explicitly to every helper call (the helpers' own `$script:AdoSession` lookup fails in some
call patterns).

```powershell
. .github/skills/ado-powershell/load.ps1    # creates $AdoSession from ADO_ORG, ADO_PROJECT, ADO_PAT
.\integrations\ado-powershell\scripts\create-testplan-from-mapping.ps1 `
  -PlanId      <PLAN_ID> `
  -SuiteId     <SUITE_ID> `
  -MappingFile .\qa\08-azure-integration\tc-mapping-{module}.json `
  -Session     $AdoSession
```

- `-SuiteId` is optional: without it the `suiteId` of the mapping file is used.
- `-Session` is optional when `$AdoSession` is visible from the script. With no usable session
  (missing `Org`, `Project` or `Headers.Authorization`) the script stops before any ADO call
  and names what is missing.

Output: `ado-ids.json` (next to the mapping file, or `-OutputFile`) with the created WI IDs,
the input of `inject-ado-ids.ps1`; record the plan and suite IDs in `module-registry.json`.

### Listing test suites

Never list the suites of a plan with the flat list (`.../_apis/testplan/Plans/{planId}/suites`)
in a single call: it returns at most 200 suites and silently truncates a larger plan. To find
the child suites of a parent (for example to reuse an existing suite by name instead of
creating a duplicate), read the parent with its children:

```
GET https://dev.azure.com/{org}/{project}/_apis/testplan/Plans/{planId}/suites/{parentSuiteId}?expand=children&api-version=7.1
```

The children are in `children` (absent when there are none). If every suite of the plan is
really needed, follow the `x-ms-continuationtoken` response header (pass it back as
`continuationToken=`) until none is returned.

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
  -OrgUrl      "https://dev.azure.com/$env:ADO_ORG" `
  -ProjectName $env:ADO_PROJECT `
  -Token       $env:ADO_PAT `
  -MappingFile .\qa\08-azure-integration\ado-ids.json `
  -SpecDir     .\qa\07-automation\e2e `
  -WhatIf
```

Apply without `-WhatIf`. Titles are read from the spec files as UTF-8 and sent as UTF-8 bytes,
so accented titles arrive intact on Windows PowerShell 5.1.

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
      "description": "{Module display name} - {N} submodules"
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

**`isDisabled: !process.env.CI`** - prevents publishing from local developer runs.

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

1. `ADO_PAT` is **never** committed to any file - always from env var or CI variable group
2. `ADO_PAT` is **never** logged, printed, or written to any markdown file
3. If a PAT appears in any log or output: revoke it immediately in ADO Portal, generate new one
4. Variable group `qa-secrets` must be scoped to the pipeline only - no project-wide access
5. PAT minimum scopes: `Work Items (Read, Write)`, `Test Management (Read, Write)` - never use full-access PATs
