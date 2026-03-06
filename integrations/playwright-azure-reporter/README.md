# Integration — playwright-azure-reporter

Connects Playwright test results to Azure DevOps Test Plans automatically.

## Package

```bash
npm install --save-dev @alex_neo/playwright-azure-reporter
```

## Required environment variables

```
ADO_ORG_URL=https://dev.azure.com/your-org
ADO_PROJECT_NAME=YourProject
ADO_PLAN_ID=<plan-id>
AZURE_TOKEN=<personal-access-token>
```

> These variables MUST be injected via CI secrets (Azure Pipeline Library Variable Group).
> NEVER store tokens in `.env` files committed to source control.

## playwright.config.ts snippet

```typescript
import type { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['@alex_neo/playwright-azure-reporter', {
      token:           process.env.AZURE_TOKEN!,
      planId:          Number(process.env.ADO_PLAN_ID),
      projectName:     process.env.ADO_PROJECT_NAME!,
      orgUrl:          process.env.ADO_ORG_URL!,
      testRunTitle:    `[Automated] ${new Date().toISOString().slice(0, 10)}`,
      publishResultsOnFailure: true,
      isDisabled:      process.env.ADO_SYNC_DISABLED === 'true',
    }],
  ],
};

export default config;
```

## Test case title format (required for ADO sync)

The reporter matches test titles to ADO Work Items by the numeric prefix.
After running `inject-ado-ids.ps1`, each test title will be prepended with
the ADO WI ID wrapped in square brackets:

```
[22957] [TC-MOD-SUB-001] Create supplier @P0
```

The reporter extracts `22957` and publishes results to WI #22957 in ADO.

## Module registry

The file `qa/08-azure-integration/module-registry.json` maps each spec
file/describe block to its ADO Test Suite. Example:

```json
{
  "modules": [
    {
      "name": "Suppliers",
      "specPattern": "suppliers/**/*.spec.ts",
      "adoSuiteId": 22794
    }
  ]
}
```

## Disabling ADO sync locally

Set `ADO_SYNC_DISABLED=true` in your `.env` to skip reporting while running
tests locally.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `401 Unauthorized` | Expired PAT | Regenerate PAT in ADO → User Settings |
| `Test case not found` | WI ID mismatch | Re-run `inject-ado-ids.ps1` |
| Results not published | `isDisabled: true` | Remove or set to `false` |
| Duplicate test runs | Reporter called twice | Check for duplicate reporter arrays |
