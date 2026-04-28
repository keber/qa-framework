import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config();

// -------------------------------------------------------------------
// Validate required environment variables at config load time
// -------------------------------------------------------------------
const required = ['QA_BASE_URL', 'QA_USER_EMAIL', 'QA_USER_PASSWORD'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`[qa-framework] Missing required env var: ${key}. Check your .env file.`);
  }
}

// Optional: Azure DevOps reporter configuration
// To enable: set env vars ADO_ORG, ADO_PROJECT, ADO_PAT, ADO_PLAN_ID and CI=true,
// then uncomment the reporter entry in the `reporter` array below.
// Install:  npm install @alex_neo/playwright-azure-reporter --save-dev
// import { AzureReporter } from '@alex_neo/playwright-azure-reporter';
// const adoReporterConfig = {
//   orgUrl:                  `https://dev.azure.com/${process.env.ADO_ORG}`,
//  // In CI it uses System.AccessToken (pipeline's OAuth, not subject to Conditional Access Policy).
//  // Locally, if you want to test the reporter, you can set ADO_PAT manually.
//   token:                   process.env.SYSTEM_ACCESSTOKEN ?? process.env.ADO_PAT,
//   planId:                  Number(process.env.ADO_PLAN_ID),
//   projectName:             process.env.ADO_PROJECT!,
//   testRunTitle:            `[Auto] Sprint {{NNN}} — ${new Date().toISOString().slice(0, 10)}`,
//   publishTestResultsMode:  'testRun' as const,
//   uploadAttachments:       true,
//   attachmentsType:         ['screenshot', 'video', 'trace'] as const,
//   isDisabled:              !process.env.CI,   // only publishes when CI=true
//  autoMarkTestCasesAsAutomated: {
//    enabled:                    true,
//    updateAutomatedTestName:    true,   // saves test title in AutomatedTestName
//    updateAutomatedTestStorage: true,   // saves spec file name in AutomatedTestStorage
//  },
// };

export default defineConfig({
  // ------ Test discovery ------
  testDir:  '.',
  // Use any subdir pattern your project standardizes on, e.g.:
  // testMatch: ['**/*.spec.ts'],

  // ------ Parallelism ------
  // Keep fullyParallel:false when tests share storageState / session data.
  fullyParallel: false,
  workers:       1,

  // ------ Retry strategy ------
  retries: process.env.CI ? 1 : 0,

  // ------ Reporter ------
  reporter: [
    ['html',  { open: 'never' }],
    ['list'],
    // Uncomment for ADO:
    // ['@alex_neo/playwright-azure-reporter', adoReporterConfig],
  ],

  // ------ Global settings ------
  use: {
    baseURL:            process.env.QA_BASE_URL,
    headless:           true,
    screenshot:         'only-on-failure',
    video:              'retain-on-failure',
    trace:              'retain-on-failure',
    actionTimeout:      15_000,
    navigationTimeout:  30_000,
  },

  // ------ Auth setup ------
  // global-setup.ts logs in once and saves storageState per role.
  globalSetup: './global-setup.ts',

  // ------ Projects ------
  projects: [
    {
      name: 'setup',
      use:  { ...devices['Desktop Chrome'] },
      testMatch: /global-setup\.ts/,
    },
    {
      name: 'chromium',
      use:  {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user-default.json',
      },
      dependencies: ['setup'],
    },
  ],

  // ------ Output directories ------
  outputDir:         'test-results/',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
});
