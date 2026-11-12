# Integration - ADO PowerShell Scripts

PowerShell scripts for Azure DevOps Test Plan management.
All scripts are parameterized and project-agnostic.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/md-to-tc-mapping.ps1` | Parse a Plan-de-Pruebas markdown and generate `tc-mapping.json` |
| `scripts/create-testplan-from-mapping.ps1` | Create ADO Test Cases from `tc-mapping.json` |
| `scripts/inject-ado-ids.ps1` | Inject ADO WI IDs into Playwright spec file test titles |
| `scripts/sync-ado-titles.ps1` | Sync spec file test titles back to ADO WI titles |
| `scripts/publish-results.ps1` | Publish manual results as a test run bound to test points (`-DryRun` to preview) |
| `scripts/create-issue.ps1` | Create a Bug/Issue for a defect, returning the existing item instead of a duplicate (`-DryRun` to preview) |
| `pipelines/azure-pipeline-qa.yml` | CI pipeline template for running Playwright + ADO sync |

## Prerequisites

- PowerShell 7+ (recommended) or Windows PowerShell 5.1
- `@keber/ado-powershell` installed in the project root (`create-testplan-from-mapping.ps1` loads it from the nearest `node_modules/@keber/ado-powershell`, or use an already loaded session)
- Azure DevOps Personal Access Token (PAT) with `Work Items: Read & Write` and `Test Management: Read & Write` scopes
- Org, project and PAT set as process env vars: `ADO_ORG`, plus `ADO_PROJECT_WRITE` / `ADO_PAT_WRITE` for the
  scripts that write (all of the scripts here that call ADO), each falling back to `ADO_PROJECT` / `ADO_PAT`.
  Read-only tooling uses `ADO_PROJECT_READ` / `ADO_PAT_READ`. See
  `skills/qa-ado-integration/references/credential-policy.md`.

## Quick start

```powershell
# 0. Load the ADO skill (initialises session from env vars)
. .github/skills/ado-powershell/load.ps1

# 1. Parse Plan de Pruebas markdown -> tc-mapping.json
.\node_modules\@keber\qa-framework\integrations\ado-powershell\scripts\md-to-tc-mapping.ps1 `
  -PlanFile   "qa/02-test-plans/sprints/Sprint-N/Plan-de-Pruebas-MyProject-Sprint-N-MOD-SUB.md" `
  -SpecFile   "mod/sub.spec.ts" `
  -OutputFile "qa/08-azure-integration/tc-mapping-e2e-mod-sub.json" `
  -PlanId     <PLAN_ID> `
  -SuiteId    <SUITE_ID>

# 2. Create Test Cases in ADO from tc-mapping.json (session loaded above, passed explicitly)
.\node_modules\@keber\qa-framework\integrations\ado-powershell\scripts\create-testplan-from-mapping.ps1 `
  -PlanId      <PLAN_ID> `
  -MappingFile "qa/08-azure-integration/tc-mapping-e2e-mod-sub.json" `
  -Session     $AdoSession

# 2. Inject ADO IDs into spec files (idempotent)
.\scripts\inject-ado-ids.ps1 `
  -SpecDir     "qa/07-automation/e2e" `
  -MappingFile "qa/08-azure-integration/ado-ids.json"

# 3. Run tests (ADO reporter publishes results automatically)
npx playwright test

# 4. (Optional) Sync titles back to ADO (preview first with -WhatIf)
.\scripts\sync-ado-titles.ps1 `
  -MappingFile "qa/08-azure-integration/ado-ids.json" `
  -SpecDir     "qa/07-automation/e2e" `
  -WhatIf

# 5. Publish manual results bound to test points (preview first with -DryRun)
.\scripts\publish-results.ps1 -ResultsFile "qa/08-azure-integration/results-mod-sub.json" -DryRun

# 6. Report a defect without duplicating it (preview first with -DryRun)
.\scripts\create-issue.ps1 -Title "[DEF-MOD-001] Short defect title" `
  -DescriptionFile "qa/06-defects/drafts/DEF-MOD-001.html" -DedupKey "DEF-MOD-001" -DryRun
```

The results file format, the duplicate keys and the safety guards are described in
`skills/qa-ado-integration/references/scripts-and-config.md`.

## Encoding

Every script reads its inputs as UTF-8 and writes `tc-mapping.json`, `ado-ids.json` and the
spec files it modifies as UTF-8 **without BOM** (`inject-ado-ids.ps1` also keeps each spec
file's line endings). Request bodies are sent as UTF-8 bytes. The `.ps1` files themselves
ship with a BOM so Windows PowerShell 5.1 reads their accented literals correctly.

## ADO session (create-testplan-from-mapping.ps1)

The `@keber/ado-powershell` helpers default `Org`, `Project`, `ApiV` and `Headers` from
`$script:AdoSession`, which they do not see in every call pattern (for example when
`load.ps1` was dot-sourced inside another script): every Test Case then fails. The script
therefore passes the session explicitly to `New-AdoTestCase` and `Add-AdoTestCaseToSuite`:

1. `-Session` parameter: the `$AdoSession` returned by `Initialize-AdoSession`, or a
   hashtable with `Org`, `Project`, `Headers` (with `Authorization`) and optionally `ApiV`
   (default `7.1`).
2. Otherwise, a `$AdoSession` variable visible from the script (set by `load.ps1`). When
   `ADO_PROJECT_WRITE` or `ADO_PAT_WRITE` is set, it replaces that session's `Project` or
   `Authorization` (the script writes).
3. Otherwise, the environment: `ADO_ORG`, `ADO_PROJECT_WRITE` (else `ADO_PROJECT`) and
   `ADO_PAT_WRITE` (else `ADO_PAT`).

If none gives `Org`, `Project` and `Headers.Authorization`, the script stops before any
ADO call and names what is missing. Keep the PAT in an environment variable; never write it
into a script or a session literal.

When `New-AdoTestCase` is not loaded, the script looks for the nearest
`node_modules/@keber/ado-powershell` walking up from the current directory (run it from the
project root), then from its own folder, and dot-sources that package's `load.ps1`. If none
is found it stops with an error that says to run `npm install @keber/ado-powershell`.

## Listing test suites (pagination)

The flat suite list of a plan (`GET .../_apis/testplan/Plans/{planId}/suites`) returns at
most 200 suites per call and silently truncates a larger plan. To find the child suites of
a parent suite (for example to reuse an existing suite by name), read the parent with its
children in one call:

```
GET https://dev.azure.com/{org}/{project}/_apis/testplan/Plans/{planId}/suites/{parentSuiteId}?expand=children&api-version=7.1
```

The children are in the `children` property of the response (absent when there are none).
If you really need every suite of the plan, follow the `x-ms-continuationtoken` response
header, passing it back as `continuationToken=` until no header is returned (on Windows
PowerShell 5.1 use `Invoke-WebRequest`, since `Invoke-RestMethod` does not expose response
headers there).

The shipped scripts never list suites. `Get-AdoTestSuites` of `@keber/ado-powershell` 1.5.0
uses the flat list without a continuation token: do not rely on it for plans with more than
200 suites.

## Security rules

- NEVER hardcode tokens in script files
- NEVER commit `.env` files or generated `*.json` files that contain tokens
- Prefer the process env vars (`ADO_PAT_WRITE`, else `ADO_PAT`) or a CI secret variable over `-Token`
- Give read-only sessions only `ADO_PAT_READ`; hand `ADO_PAT_WRITE` only to the step that writes
- The scripts never print the Authorization header, and `-DryRun` / `-WhatIf` need no PAT
- PAT scope: minimum `Work Items: Read & Write`, `Test Management: Read & Write`

## File: tc-mapping.json (input)

```json
{
  "planId": 22304,
  "suiteId": 22305,
  "testCases": [
    {
      "localId": "TC-SUP-CR-001",
      "title": "Create supplier @P0",
      "specFile": "suppliers/create.spec.ts",
      "steps": [
        "Navigate to /suppliers/new",
        "Fill in required fields: Name, RUT, Email",
        "Click 'Save'"
      ],
      "expectedResult": "Supplier is created and appears in the list with status Active"
    },
    {
      "localId": "TC-SUP-CR-002",
      "title": "Create supplier - required fields @P0",
      "specFile": "suppliers/create.spec.ts",
      "steps": [
        "Navigate to /suppliers/new",
        "Leave required fields empty",
        "Click 'Save'"
      ],
      "expectedResult": "Validation errors appear for each required field; record is not saved"
    }
  ]
}
```

> **`steps`** (optional): Array of step strings. Each entry becomes one ADO step. All steps except the last are `ActionStep`; the last is `ValidateStep` and receives `expectedResult`.
> **`expectedResult`** (optional): Overall expected result, applied to the last step. If omitted, the last step has an empty expected result.
> If `steps` is absent or empty, the Test Case is created with title only (no steps).

## File: ado-ids.json (output after create-testplan)

```json
[
  { "localId": "TC-SUP-CR-001", "adoWiId": 22957, "specFile": "suppliers/create.spec.ts" },
  { "localId": "TC-SUP-CR-002", "adoWiId": 22958, "specFile": "suppliers/create.spec.ts" }
]
```
