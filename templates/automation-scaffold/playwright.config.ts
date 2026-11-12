import { defineConfig, devices } from '@playwright/test';
import type { Project } from '@playwright/test';
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
// Base URL (credentials are deliberately NOT checked here)
// -------------------------------------------------------------------
// QA_BASE_URL from the environment or .env wins. Without it, project.qaBaseUrl from
// qa-framework.config.json is used: the manifest is the versioned source of the QA URL
// and holds no secrets. With neither, loading the config fails - never run without a URL.
// The resolved value is written back to process.env because global-setup.ts and the
// fixtures read process.env.QA_BASE_URL, and Playwright workers re-load this config.
//
// Credentials are NOT validated at load time. Each lane logs in with its own account
// (<ACCOUNT>_EMAIL / <ACCOUNT>_PASSWORD), and a lane that is not logging in must not be
// forced to have credentials loaded. A missing credential still fails loudly, naming
// the variable, at the moment it is needed: when global-setup.ts logs that lane in
// (see laneCredentials() in scripts/global-setup-guards.js).
const laneConfig = require('./scripts/lane-config.js');
process.env.QA_BASE_URL = laneConfig.loadQaBaseUrl(process.env, __dirname).url;

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

// -------------------------------------------------------------------
// Login happens only in global setup
// -------------------------------------------------------------------
// global-setup.ts logs each lane in once, in its own browser that records nothing, and
// saves the session as storageState. Tests start from that storageState and never log in
// themselves. That is what makes trace/video/screenshot 'retain-on-failure' below safe:
// a login inside a test would put the typed credentials and the login request, password
// included, into the trace, the video and the screenshots of every failed run.
//
// The only exception is a test of the login flow itself. It lives in a *.login.spec.ts
// file and runs only in the opt-in 'login-flow' project, which records nothing.
// fixtures/auth.ts loginAs() refuses to run in a project that records anything.
const NO_ARTIFACTS = { trace: 'off', video: 'off', screenshot: 'off' } as const;

// Directories that hold no suite, ignored by every project. A project-level testIgnore
// replaces the top-level one instead of adding to it, so each project repeats these.
const BASE_TEST_IGNORE = ['**/helpers/debug/**', '**/seeds/**'];

// -------------------------------------------------------------------
// Opt-in projects
// -------------------------------------------------------------------
// Expensive or risky suites - writes, slow suites, the login flow - are registered only
// when selected explicitly, so `npm test` never sees them:
//   npm run test:<name>                  (node scripts/run-opt-in.js <name>, no shell)
//   npx playwright test --project <name>
//   QA_RUN_<NAME>=1 in the environment   ('login-flow' -> QA_RUN_LOGIN_FLOW)
// Their files are picked by suffix, and every lane project ignores those suffixes, so an
// opt-in test never runs by accident in the default suite.
// To add one: add an entry here, name its files with the suffix, and add
//   "test:<name>": "node scripts/run-opt-in.js <name>"
// to package.json. Any project that writes follows qa/00-standards/write-safety-policy.md.
type OptInProject = {
  name: string;
  testMatch: string;
  lane: boolean;          // true: runs with a lane session (storageState) after 'setup'
  use?: Project['use'];
};
const OPT_IN_PROJECTS: OptInProject[] = [
  { name: 'login-flow', testMatch: '**/*.login.spec.ts',  lane: false, use: NO_ARTIFACTS },
  { name: 'writes',     testMatch: '**/*.writes.spec.ts', lane: true },
  { name: 'slow',       testMatch: '**/*.slow.spec.ts',   lane: true },
];

// Reads QA_RUN_<NAME> and --project from process.argv, and writes the selection back to
// process.env so Playwright workers, which re-load this config without --project,
// register the same projects (see resolveOptInProjects in global-setup-guards.js).
const guards = require('./scripts/global-setup-guards.js');
const selectedOptIn: string[] = guards.resolveOptInProjects(
  OPT_IN_PROJECTS.map((p) => p.name),
  process.env,
  process.argv
);

// One Playwright project per configured lane. A lane that declares a runnerProject uses
// that name; otherwise the project is named chromium-lane-<id>. With the single implicit
// default lane this yields one project named 'chromium'.
const laneProjects = Object.entries(LANE_INFO).map(([laneId, lane]) => ({
  name: lane.runnerProject || `chromium-lane-${laneId}`,
  testIgnore: [...BASE_TEST_IGNORE, ...OPT_IN_PROJECTS.map((p) => p.testMatch)],
  use: {
    ...devices['Desktop Chrome'],
    storageState: resolveStorageState(laneId),
  },
  dependencies: ['setup'],
}));

// An opt-in project with lane: true uses the lane QA_LANE_ONLY names, else the first
// lane of the table, through the same resolver as the lane projects.
const OPT_IN_LANE_ID = Object.keys(LANE_INFO)[0];
const optInProjects = OPT_IN_PROJECTS
  .filter((p) => selectedOptIn.includes(p.name))
  .map((p) => (p.lane
    ? {
        name: p.name,
        testMatch: p.testMatch,
        testIgnore: BASE_TEST_IGNORE,
        use: { ...devices['Desktop Chrome'], storageState: resolveStorageState(OPT_IN_LANE_ID), ...p.use },
        dependencies: ['setup'],
      }
    : {
        name: p.name,
        testMatch: p.testMatch,
        testIgnore: BASE_TEST_IGNORE,
        use: { ...devices['Desktop Chrome'], ...p.use },
      }));

export default defineConfig({
  // ------ Test discovery ------
  testDir:  './tests',
  // Exclude non-suite directories from test runs
  testIgnore: BASE_TEST_IGNORE,
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
  // Safe to keep failure artifacts only because no test logs in (see "Login happens
  // only in global setup" above).
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
  // global-setup.ts logs in once per lane and saves storageState. It is the only place
  // a login happens.
  globalSetup: './global-setup.ts',

  // ------ Projects ------
  // To add a lane, add an entry to parallelLanes.lanes in qa-framework.config.json.
  // There is nothing to uncomment or copy-paste here: the lane projects are generated
  // from that table, so the config stays the only place a lane is defined.
  // Opt-in projects are appended only when selected (see OPT_IN_PROJECTS above).
  projects: [
    {
      name: 'setup',
      // Records nothing: anything that authenticates here must never reach an artifact.
      use:  { ...devices['Desktop Chrome'], ...NO_ARTIFACTS },
      testMatch: /global-setup\.ts/,
    },
    ...laneProjects,
    ...optInProjects,
  ],

  // ------ Output directories ------
  outputDir:         'test-results/',
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFilePath}/{arg}{ext}',
});
