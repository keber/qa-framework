# Reference: ADO Scripts and Configuration

> Loaded by `skills/qa-ado-integration/` for PowerShell scripts, reporter config, and CI pipeline.

---

## PowerShell Scripts Usage

### Credentials: read and write variables

The scripts follow the read/write split of `references/credential-policy.md` (section 5).
Set the variables in the process that runs the script, never as persisted user or machine
variables:

| Variable | Used for | Fallback |
|---|---|---|
| `ADO_ORG` | Organization name (`https://dev.azure.com/<name>`) or full organization URL | - |
| `ADO_PROJECT_READ` | The project read-only tooling reads from (work items, PRs, code) | `ADO_PROJECT` |
| `ADO_PAT_READ` | PAT with read scopes only, for tooling that never writes | `ADO_PAT` |
| `ADO_PROJECT_WRITE` | The project QA writes test plans, test cases, results and defects to | `ADO_PROJECT` |
| `ADO_PAT_WRITE` | PAT with the write scopes the write scripts need | `ADO_PAT` |

Every shipped script that calls ADO writes, so all of them prefer `ADO_PROJECT_WRITE` and
`ADO_PAT_WRITE` (`publish-results.ps1`, `create-issue.ps1`, `sync-ado-titles.ps1`,
`create-testplan-from-mapping.ps1`); read-only recipes such as the work item full-read
protocol use the `_READ` pair. An explicit `-ProjectName`, `-Token` or `-Session` always wins.
A missing value is reported by variable name, never by value.

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
- Session resolution: `-Session` as given; else a visible `$AdoSession`, whose `Project` and
  `Authorization` are replaced by `ADO_PROJECT_WRITE` and `ADO_PAT_WRITE` when those are set;
  else a session built from `ADO_ORG`, `ADO_PROJECT_WRITE` (or `ADO_PROJECT`) and
  `ADO_PAT_WRITE` (or `ADO_PAT`). With no usable session (missing `Org`, `Project` or
  `Headers.Authorization`) the script stops before any ADO call and names what is missing.
- When the helpers are not loaded, the script dot-sources the `load.ps1` of the nearest
  `node_modules/@keber/ado-powershell`, walking up from the current directory (run it from
  the project root). If none is found it stops and says to run
  `npm install @keber/ado-powershell`.

Output: `ado-ids.json` (next to the mapping file, or `-OutputFile`), a UTF-8 JSON array without
BOM with the created WI IDs, the input of `inject-ado-ids.ps1`; record the plan and suite IDs
in `module-registry.json`.

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

Spec files are read as UTF-8 and a modified file is written back as UTF-8 without BOM with
its original line endings (CRLF or LF); accents are preserved and a file that needs no change
is not rewritten.

---

### sync-ado-titles.ps1

Syncs ADO TC titles with local spec file titles (detects drift):

```powershell
# ADO_ORG, ADO_PROJECT_WRITE and ADO_PAT_WRITE set in this process
.\integrations\ado-powershell\scripts\sync-ado-titles.ps1 `
  -MappingFile .\qa\08-azure-integration\ado-ids.json `
  -SpecDir     .\qa\07-automation\e2e `
  -WhatIf
```

`-OrgUrl`, `-ProjectName` and `-Token` are optional: they default to `ADO_ORG`,
`ADO_PROJECT_WRITE` (else `ADO_PROJECT`) and `ADO_PAT_WRITE` (else `ADO_PAT`). Apply without
`-WhatIf`. Titles are read from the spec files as UTF-8 and sent as UTF-8 bytes, so accented
titles arrive intact on Windows PowerShell 5.1.

---

### publish-results.ps1

Publishes manual execution results the way the ADO Test Runner does: one test run bound to
the test points of a suite, so the outcomes show in the test plan.

```powershell
# Preview: prints every request and sends nothing (no PAT needed)
.\integrations\ado-powershell\scripts\publish-results.ps1 `
  -ResultsFile .\qa\08-azure-integration\results-{module}.json -DryRun

# Publish (ADO_ORG, ADO_PROJECT_WRITE and ADO_PAT_WRITE set in this process)
.\integrations\ado-powershell\scripts\publish-results.ps1 `
  -ResultsFile .\qa\08-azure-integration\results-{module}.json
```

Results file (UTF-8 JSON):

```json
{
  "planId": 101,
  "suiteId": 202,
  "runName": "Manual run - {module} - {build}",
  "results": [
    { "testCaseId": 4242, "outcome": "Passed", "comment": "Optional" },
    { "adoWiId": 4243, "outcome": "Failed", "comment": "Search by year returns no rows" },
    { "pointId": 9003, "outcome": "Blocked" }
  ]
}
```

- Steps: read the suite's test points (following `x-ms-continuationtoken`), create the run
  (`POST _apis/test/runs` with `pointIds`, `isAutomated: false`), record each outcome
  (`PATCH _apis/test/Runs/{runId}/results`), close the run (`state: Completed`).
- Outcomes: `Passed`, `Failed`, `Blocked`, `NotApplicable`, `Paused`, `NotExecuted`
  (case-insensitive). `adoWiId` is a synonym of `testCaseId`. Give `pointId` when a test case
  has several points in the suite (one per configuration). Comments over 1000 characters are
  truncated with a warning.
- Everything is validated before the first write. If a selected point already has an outcome
  the script stops before creating a run; `-Force` publishes a new run anyway.
- If a step fails after the run was created, the error names the run so it can be reviewed or
  deleted in ADO before retrying. Evidence attachments are not uploaded.

---

### create-issue.ps1

Creates a Bug (or `-Type Issue`) for a QA defect, idempotently: it first searches the write
project with WIQL and returns the existing item instead of creating a duplicate.

```powershell
.\integrations\ado-powershell\scripts\create-issue.ps1 `
  -Title           "[DEF-MOD-001] Search by year returns no rows" `
  -DescriptionFile .\qa\06-defects\drafts\DEF-MOD-001.html `
  -DedupKey        "DEF-MOD-001" `
  -TestedBy        4242 `
  -Priority        2 `
  -DryRun
```

- Duplicate key: by default the exact title within the same work item type. With
  `-DedupKey` the key is stored as a tag and searched with `[System.Tags] CONTAINS`, whatever
  the title or type; candidates are read back and the tag must match exactly. When several
  items match, the lowest ID is returned and the others are reported as a warning.
- The description goes to `Microsoft.VSTS.TCM.ReproSteps` for a Bug and to
  `System.Description` for other types (`-DescriptionField` overrides it). `-TestedBy` adds
  Tested By links to test cases; `-Related` adds Related links.
- Output: an object with `id`, `created` (`$false` when an existing item was returned),
  `state` and `url`. `-DryRun` prints the search and the create request without sending them.
- Two runs started at the same moment for the same defect can both create an item; the
  search and the create are separate requests.

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
6. Read-only sessions receive only `ADO_PAT_READ`; only the step that writes receives `ADO_PAT_WRITE` (see `credential-policy.md`)
