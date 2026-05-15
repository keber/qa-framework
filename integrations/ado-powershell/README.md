# Integration — ADO PowerShell Scripts

PowerShell scripts for Azure DevOps Test Plan management.
All scripts are parameterized and project-agnostic.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/inject-ado-ids.ps1` | Prepend ADO Work Item IDs to spec file test titles |
| `scripts/create-testplan-from-mapping.ps1` | Create ADO Test Cases from a TC mapping JSON file |
| `scripts/sync-ado-titles.ps1` | Sync spec file test titles back to ADO WI titles |
| `pipelines/azure-pipeline-qa.yml` | CI pipeline template for running Playwright + ADO sync |

## Prerequisites

- PowerShell 7+ (recommended) or Windows PowerShell 5.1
- `@keber/ado-powershell` skill installed and loaded (provides `New-AdoTestCase`, `Add-AdoTestCaseToSuite`, etc.)
- Azure DevOps Personal Access Token (PAT) with `Work Items: Read & Write` and `Test Management: Read & Write` scopes
- PAT and org/project set as env vars: `ADO_PAT`, `ADO_ORG`, `ADO_PROJECT`

## Quick start

```powershell
# 0. Load the ADO skill (initialises session from env vars)
. .github/skills/ado-powershell/load.ps1

# 1. Create Test Cases in ADO from tc-mapping.json
.\scripts\create-testplan-from-mapping.ps1 `
  -PlanId      22304 `
  -MappingFile "qa/08-azure-integration/tc-mapping.json"

# 2. Inject ADO IDs into spec files (idempotent)
.\scripts\inject-ado-ids.ps1 `
  -SpecDir     "qa/07-automation/e2e" `
  -MappingFile "qa/08-azure-integration/ado-ids.json"

# 3. Run tests (ADO reporter publishes results automatically)
npx playwright test

# 4. (Optional) Sync titles back to ADO
.\scripts\sync-ado-titles.ps1 `
  -OrgUrl      "https://dev.azure.com/your-org" `
  -ProjectName "YourProject" `
  -MappingFile "qa/08-azure-integration/ado-ids.json" `
  -Token       $env:AZURE_TOKEN
```

## Security rules

- NEVER hardcode tokens in script files
- NEVER commit `.env` files or generated `*.json` files that contain tokens
- Always pass `-Token` as a parameter from `$env:AZURE_TOKEN` or a CI secret variable
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
