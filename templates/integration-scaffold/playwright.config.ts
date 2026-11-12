/**
 * playwright.config.ts - API integration test project (no browser)
 *
 * All tests use APIRequestContext through the fixtures in fixtures/base.ts.
 * Auth is handled by global-setup.ts, which writes .auth/api-session.json.
 *
 * Env vars (from the environment, or this folder's .env):
 *   QA_BASE_URL     - Base URL of the API under test. Without it, tests that call
 *                     the API are skipped with a message; offline guard tests still run.
 * Auth (one of the following; checked when a test needs a session, not here):
 *   QA_API_TOKEN    - Bearer token (skips browser login in global-setup)
 *   QA_USER_EMAIL + QA_USER_PASSWORD  - Credentials for browser-based login
 *
 * Writes (qa/00-standards/write-safety-policy.md): tests/write/ is loaded only when
 * QA_API_WRITE=1, which only `npm run test:write` sets. `npm test` never writes.
 *
 * Self-contained on purpose: this file requires nothing from scripts/ or fixtures/,
 * so `qa-framework upgrade` can refresh it in a project that predates those files.
 */

import { defineConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Least privilege: read only the keys this config actually uses. dotenv.parse() returns
// a plain object without touching process.env, so the other secrets in .env - the other
// QA accounts, ADO tokens - are never loaded into a process that has no use for them.
// QA_USER_PASSWORD is copied because the API fixtures and global-setup read it; its value
// is never logged. Do not "simplify" this back to config().
const ENV_KEYS = ['QA_BASE_URL', 'QA_API_TOKEN', 'QA_USER_EMAIL', 'QA_USER_PASSWORD'] as const;

// The write opt-in must come from the write command of this run only, never from a
// file every run reads (write-safety-policy.md, section 2, gate 1).
const WRITE_OPT_IN = 'QA_API_WRITE';

if (fs.existsSync('.env')) {
  const parsed = dotenv.parse(fs.readFileSync('.env'));
  if (parsed[WRITE_OPT_IN] !== undefined) {
    throw new Error(
      `[integration] ${WRITE_OPT_IN} is set in .env. Remove it: writes are enabled only by \`npm run test:write\`, for that run.`,
    );
  }
  for (const key of ENV_KEYS) {
    if (process.env[key] === undefined && parsed[key] !== undefined) {
      process.env[key] = parsed[key];
    }
  }
}

const writeRun = process.env[WRITE_OPT_IN] === '1';

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
  // Write tests are not even loaded unless this run opted in.
  testIgnore:    writeRun ? [] : ['**/write/**'],
  fullyParallel: false,
  workers:       1,
  timeout:       30_000,
  // A retried write is a second write: never retry in a write run.
  retries:       writeRun ? 0 : process.env.CI ? 1 : 0,

  globalSetup:  './global-setup.ts',

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    // Uncomment for ADO:
    // ['@alex_neo/playwright-azure-reporter', adoReporterConfig],
  ],

  use: {
    baseURL:      process.env.QA_BASE_URL || undefined,
    storageState: '.auth/api-session.json',
  },

  outputDir: 'test-results/',
});
