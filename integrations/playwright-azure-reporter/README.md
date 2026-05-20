# Integration - playwright-azure-reporter

Connects Playwright test results to Azure DevOps Test Plans automatically.

## Package

```bash
npm install --save-dev @alex_neo/playwright-azure-reporter
```

## Environment variables

### Local development (`.env`)

```
ADO_ORG=<org-slug>
ADO_PROJECT=<project-name>
ADO_PLAN_ID=<plan-id>
AZURE_TOKEN=<personal-access-token> # PAT with Test Management: Read & Write
```

> NEVER commit `.env` files to source control.

### CI/CD pipeline (`QA-Variables` Library Variable Group)

In the pipeline, `SYSTEM_ACCESSTOKEN` (OAuth) is used instead of a PAT -
no `AZURE_TOKEN` is needed. The reporter accepts both authentication methods.

```
ADO_ORG=<org-slug>
ADO_PROJECT=<project-name>
ADO_E2E_PLAN_ID=<plan-id>
ADO_API_PLAN_ID=<plan-id>
```

`SYSTEM_ACCESSTOKEN` is injected automatically by the pipeline via `$(System.AccessToken)`.

## playwright.config.ts snippet

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['@alex_neo/playwright-azure-reporter', {
      token:                   process.env.SYSTEM_ACCESSTOKEN ?? process.env.AZURE_TOKEN!,
      planId:                  Number(process.env.ADO_PLAN_ID),
      projectName:             process.env.ADO_PROJECT!,
      orgUrl:                  `https://dev.azure.com/${process.env.ADO_ORG}`,
      testRunTitle:            `[Automated] ${new Date().toISOString().slice(0, 10)}`,
      publishResultsOnFailure: true,
    }],
  ],
});
```

> `token` falls back to `AZURE_TOKEN` when `SYSTEM_ACCESSTOKEN` is not present (local runs).

## Playwright Workspaces reporter (optional)

To also publish results to the Azure Playwright Workspaces dashboard, add
`@azure/playwright` alongside `@alex_neo/playwright-azure-reporter`.

```bash
npm install --save-dev @azure/playwright
```

Create a `playwright.service.config.ts` file next to `playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';
import { createAzurePlaywrightConfig } from '@azure/playwright';
import { DefaultAzureCredential } from '@azure/identity';
import config from './playwright.config';

export default defineConfig(
  config,
  createAzurePlaywrightConfig(config, {
    credential: new DefaultAzureCredential(),
  })
);
```

Run using the service config in CI:

```bash
npx playwright test -c playwright.service.config.ts
```

Required variable (add to `QA-Variables` Library Variable Group):

```
PLAYWRIGHT_SERVICE_URL=<workspace-endpoint-url>   # Azure Portal -> Playwright workspace -> Get Started
```

Authentication uses Microsoft Entra ID via the pipeline's Azure service connection
(`AzureCLI@2` login task). No `PLAYWRIGHT_SERVICE_ACCESS_TOKEN` is needed when
Entra ID is configured. See `pipelines/azure-pipeline-qa.yml` for the commented
placeholder steps.

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

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `401 Unauthorized` (local) | Expired PAT | Regenerate PAT in ADO -> User Settings |
| `401 Unauthorized` (pipeline) | `SYSTEM_ACCESSTOKEN` not passed | Verify `env: SYSTEM_ACCESSTOKEN: $(System.AccessToken)` in the pipeline step |
| `Test case not found` | WI ID mismatch | Re-run `inject-ado-ids.ps1` |
| Duplicate test runs | Reporter called twice | Check for duplicate reporter arrays |
