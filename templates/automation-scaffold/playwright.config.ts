import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Least privilege: this config only needs a handful of non-secret values, so it reads
// them with dotenv.parse(), which returns a plain object and never touches process.env.
// dotenv.config() would inject the WHOLE .env - every QA account password and ADO token
// living in it - into a process that has no use for them, where any dependency, crash
// dump or child process inherits them. Do not "simplify" this back to config().
const ENV_KEYS = ['QA_SESSION_TTL_MS', 'QA_BASE_URL'] as const;
if (fs.existsSync('.env')) {
  const parsed = dotenv.parse(fs.readFileSync('.env'));
  for (const key of ENV_KEYS) {
    if (process.env[key] === undefined && parsed[key] !== undefined) {
      process.env[key] = parsed[key];
    }
  }
}

export const SESSION_TTL_MS = Number(process.env.QA_SESSION_TTL_MS ?? 2 * 60 * 60 * 1000);

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
//   testRunTitle:            `[Auto] Sprint {{NNN}} - ${new Date().toISOString().slice(0, 10)}`,
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

// -------------------------------------------------------------------
// Parallel QA lanes
// -------------------------------------------------------------------
// A lane is a distinct QA account. Lanes exist because the applications under test
// invalidate a session when the same account logs in again, so two concurrent workers
// sharing one account silently destroy each other's session. Speed is not the reason.
//
// The lane table lives in qa-framework.config.json (parallelLanes.lanes) and is read
// here through lane-lock.js, which is the SINGLE SOURCE OF TRUTH for the
// lane -> storageState mapping. Never hardcode a storageState on a project below. A
// parallel hardcoded mapping caused real evidence corruption once already: a project
// pinned to one lane's storageState while QA_LANE_ONLY named another, so a run was
// recorded under the wrong account and nothing failed at the time.
//
// A project with no parallelLanes block gets one implicit default lane, producing
// exactly the single 'chromium' project this scaffold shipped before lanes existed.
const laneLock = require('./scripts/lane-lock.js');

type LaneInfo = {
  account: string;
  storageState: string;
  mcpNamespace: string | null;
  runnerProject: string | null;
  capabilities: string[];
};
const LANE_INFO: Record<string, LaneInfo> = laneLock.LANE_INFO;

// QA_LANE_ONLY pins the whole run to a single lane. When it is set, every lane project
// resolves its storageState through that lane, so a --project bound to a different lane
// cannot quietly drive an account this run does not hold. global-setup-guards.js
// additionally rejects a --project whose storageState does not match the reserved lane.
const QA_LANE_ONLY = process.env.QA_LANE_ONLY;

function resolveStorageState(laneId: string): string {
  return QA_LANE_ONLY
    ? laneLock.storageStateForLaneOnly(QA_LANE_ONLY)
    : LANE_INFO[laneId].storageState;
}

// One Playwright project per configured lane. A lane that declares a runnerProject uses
// that name; otherwise the project is named chromium-lane-<id>. With the single implicit
// default lane this yields one project named 'chromium'.
const laneProjects = Object.entries(LANE_INFO).map(([laneId, lane]) => ({
  name: lane.runnerProject || `chromium-lane-${laneId}`,
  use: {
    ...devices['Desktop Chrome'],
    storageState: resolveStorageState(laneId),
  },
  dependencies: ['setup'],
}));

export default defineConfig({
  // ------ Test discovery ------
  testDir:  './tests',
  // Exclude non-suite directories from test runs
  testIgnore: ['**/helpers/debug/**', '**/seeds/**'],
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
  // To add a lane, add an entry to parallelLanes.lanes in qa-framework.config.json.
  // There is nothing to uncomment or copy-paste here: the lane projects are generated
  // from that table, so the config stays the only place a lane is defined.
  projects: [
    {
      name: 'setup',
      use:  { ...devices['Desktop Chrome'] },
      testMatch: /global-setup\.ts/,
    },
    ...laneProjects,
  ],

  // ------ Output directories ------
  outputDir:         'test-results/',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
});
