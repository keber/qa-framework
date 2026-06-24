/**
 * playwright.config.ts - API integration test project (no browser)
 *
 * All tests use APIRequestContext directly. No browser projects are defined.
 * Auth is handled by global-setup.ts, which writes .auth/api-session.json.
 *
 * Required env vars:
 *   QA_BASE_URL     - Base URL of the API under test
 *
 * Auth (at least one of the following):
 *   QA_API_TOKEN    - Bearer token (skips browser login in global-setup)
 *   QA_USER_EMAIL + QA_USER_PASSWORD  - Credentials for browser-based login
 */

import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

const required = ['QA_BASE_URL'];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`[integration] Missing required env var: ${key}. Check your .env file.`);
  }
}

const hasToken = !!process.env.QA_API_TOKEN;
const hasCredentials = !!(process.env.QA_USER_EMAIL && process.env.QA_USER_PASSWORD);

if (!hasToken && !hasCredentials) {
  throw new Error(
    '[integration] No auth configured. Set QA_API_TOKEN, or both QA_USER_EMAIL and QA_USER_PASSWORD.',
  );
}

// Optional: Azure DevOps reporter configuration
// To enable: set env vars ADO_ORG, ADO_PROJECT, ADO_PAT, ADO_PLAN_ID and CI=true,
// then uncomment the reporter entry in the `reporter` array below.
// Install:  npm install @alex_neo/playwright-azure-reporter --save-dev
// const adoReporterConfig = {
//   orgUrl:                  `https://dev.azure.com/${process.env.ADO_ORG}`,
//   token:                   process.env.SYSTEM_ACCESSTOKEN ?? process.env.ADO_PAT,
//   planId:                  Number(process.env.ADO_PLAN_ID),
//   projectName:             process.env.ADO_PROJECT!,
//   testRunTitle:            `[Auto API] ${new Date().toISOString().slice(0, 10)}`,
//   publishTestResultsMode:  'testRun' as const,
//   uploadAttachments:       false,
//   isDisabled:              !process.env.CI,
//   autoMarkTestCasesAsAutomated: {
//     enabled:                    true,
//     updateAutomatedTestName:    true,
//     updateAutomatedTestStorage: true,
//   },
// };

export default defineConfig({
  testDir:       './tests',
  fullyParallel: false,
  workers:       1,
  timeout:       30_000,
  retries:       process.env.CI ? 1 : 0,

  globalSetup:  './global-setup.ts',

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    // Uncomment for ADO:
    // ['@alex_neo/playwright-azure-reporter', adoReporterConfig],
  ],

  use: {
    baseURL:      process.env.QA_BASE_URL,
    storageState: '.auth/api-session.json',
  },

  outputDir: 'test-results/',
});
