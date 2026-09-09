/**
 * global-setup.ts
 *
 * Runs ONCE before all test files.
 * Logs in as the default QA user and saves storageState so each test
 * doesn't need to repeat the login flow.
 *
 * For multi-role projects:
 *   - Add additional loginAs() calls below, one per role.
 *   - Save each to `.auth/user-{role}.json`.
 *   - Reference the matching storageState in playwright.config.ts projects[].
 *
 * Environment variables required:
 *   QA_BASE_URL           - Base URL of the application under test
 *   QA_USER_EMAIL         - Default QA user email (or username/RUT)
 *   QA_USER_PASSWORD      - Default QA user password
 *   QA_LOGIN_PATH         - Relative path to the login page (default: /login)
 *   QA_LOGIN_EMAIL_SELECTOR    - CSS selector for the username/email input
 *   QA_LOGIN_PASSWORD_SELECTOR - CSS selector for the password input
 *   QA_LOGIN_SUBMIT_SELECTOR   - CSS selector for the submit button
 *   QA_LOGIN_SUCCESS_SELECTOR  - CSS selector that confirms successful login
 *
 * See .env.example for all supported variables.
 */

import { chromium, FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config();

// Lane table and guards. Both are CommonJS so the guard logic stays testable with
// `node --test` without adding ts-node or tsx as a dependency.
const laneLock = require('./scripts/lane-lock.js');
const guards = require('./scripts/global-setup-guards.js');

type LaneInfo = {
  account: string;
  storageState: string;
  mcpNamespace: string | null;
  runnerProject: string | null;
  capabilities: string[];
};
const LANE_INFO: Record<string, LaneInfo> = laneLock.LANE_INFO;

function resolveVar(param: string | undefined, envKey: string, defaultValue: string): [string, string] {
  if (param !== undefined) {
    return [param, 'param'];
  }
  if (process.env[envKey] !== undefined) {
    return [process.env[envKey]!, `env:${envKey}`];
  }
  return [defaultValue, 'default'];
}

/**
 * Decides which lanes to log in.
 *
 * Resolution order:
 *   1. QA_LANE_ONLY  - pins the run to exactly one lane. This is the normal path and
 *      the only one the guards permit without an explicit cold-setup opt-in.
 *   2. QA_AUTH_USER  - comma-separated lane ids, for an intentional multi-lane setup.
 *   3. the projects' storageState, matched against the lane table.
 *   4. every configured lane (the cold-setup path, gated by QA_COLD_SETUP=1).
 *
 * Step 3 matches storageState by EXACT equality against the lane table rather than by
 * substring. The previous scaffold used storageState.includes('user-2'), which is what
 * breaks first beyond two lanes: 'user-2' is a substring of 'user-20', and there was no
 * branch at all for a third lane, so lanes past the second were silently never logged in.
 */
function resolveAuthLanes(config: FullConfig): string[] {
  const laneIds = Object.keys(LANE_INFO);

  const laneOnly = process.env.QA_LANE_ONLY;
  if (laneOnly) {
    // Throws on an unknown lane rather than guessing. Guessing is how a run logs into
    // an account it does not hold.
    return [laneLock.laneIdForQaLaneOnly(laneOnly)];
  }

  const explicit = process.env.QA_AUTH_USER;
  if (explicit) {
    const resolved = explicit
      .split(',')
      .map((value) => value.trim())
      .filter((value) => laneIds.includes(value));
    if (resolved.length) return resolved;
  }

  const fromProjects = new Set<string>();
  for (const project of config.projects) {
    const storageState = (project.use as { storageState?: unknown } | undefined)?.storageState;
    if (typeof storageState !== 'string') continue;
    for (const laneId of laneIds) {
      if (LANE_INFO[laneId].storageState === storageState) fromProjects.add(laneId);
    }
  }
  if (fromProjects.size) return [...fromProjects];

  return laneIds;
}

async function dismissOnboardingFlow(page: import('@playwright/test').Page): Promise<void> {
  // Override this with your app's onboarding dismissal logic.
  // Use QA_DISMISS_ONBOARDING_LABELS (comma-separated button labels) to enable
  // without modifying this file. Example: QA_DISMISS_ONBOARDING_LABELS=Skip,Got it
  const raw = process.env.QA_DISMISS_ONBOARDING_LABELS ?? '';
  const labels = raw.split(',').map((l: string) => l.trim()).filter(Boolean);
  if (!labels.length) return;

  for (let round = 0; round < 3; round++) {
    let dismissed = false;
    for (const label of labels) {
      const button = page.getByRole('button', { name: label, exact: true }).first();
      const visible = await button.isVisible({ timeout: 1_000 }).catch(() => false);
      if (visible) {
        await button.click({ timeout: 2_000 }).catch(() => {});
        await page.waitForTimeout(250);
        dismissed = true;
      }
    }
    if (!dismissed) {
      break;
    }
  }
}

/** Perform login and persist storageState to disk. */
async function loginAs(params: {
  email:             string;
  password:          string;
  baseURL:           string;
  loginPath?:        string;
  emailSelector?:    string;
  passwordSelector?: string;
  submitSelector?:   string;
  successSelector?:  string;
  stateFile:         string;
}): Promise<void> {
  const {
    email,
    password,
    baseURL,
    loginPath        = process.env.QA_LOGIN_PATH        ?? '/login',
    emailSelector    = process.env.QA_LOGIN_EMAIL_SELECTOR    ?? 'input[type="email"]',
    passwordSelector = process.env.QA_LOGIN_PASSWORD_SELECTOR ?? 'input[type="password"]',
    submitSelector   = process.env.QA_LOGIN_SUBMIT_SELECTOR   ?? 'button[type="submit"]',
    successSelector  = process.env.QA_LOGIN_SUCCESS_SELECTOR  ?? '.dashboard, .main-content, [data-testid="app-shell"]',
    stateFile,
  } = params;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page    = await context.newPage();

  try {
    const loginUrl = `${baseURL}${loginPath.startsWith('/') ? loginPath : `/${loginPath}`}`;
    let signedIn = false;

    for (let attempt = 1; attempt <= 3 && !signedIn; attempt++) {
      await page.goto(loginUrl, { waitUntil: 'load', timeout: 60_000 });
      await page.locator(emailSelector).fill(email);
      // Trace safety: Playwright records fill() argument values in traces, and this
      // project runs with trace/video 'retain-on-failure' - a failed CI run would
      // persist the plaintext password in the artifact. Setting the value through
      // evaluate() keeps it out of the trace. Do not "simplify" this back to fill().
      // The input/change events are required because assigning .value directly does
      // not notify SPA frameworks (Blazor/Radzen bind on those events).
      // evaluate() has no auto-wait, so the explicit waitFor replaces the one that
      // locator().fill() performed implicitly.
      await page.locator(passwordSelector).waitFor({ state: 'visible', timeout: 30_000 });
      await page.evaluate(
        ([selector, pwd]) => {
          const input = document.querySelector(selector) as HTMLInputElement | null;
          if (!input) {
            throw new Error(`[qa-framework] Password input not found for selector: ${selector}`);
          }
          input.value = pwd;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        },
        [passwordSelector, password] as const
      );
      await page.locator(submitSelector).click();

      const result = await Promise.race([
        page.waitForSelector(successSelector, { timeout: 30_000 }).then(() => 'ok' as const),
        page.locator('text=An unhandled error has occurred.').waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'crash' as const),
      ]).catch(() => 'timeout' as const);

      if (result === 'ok') {
        signedIn = true;
      } else if (result === 'crash') {
        await page.getByText('Reload').click({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(2_000);
      }
    }

    if (!signedIn) {
      throw new Error('[qa-framework] Login did not reach the success selector after 3 attempts.');
    }

    await dismissOnboardingFlow(page);

    // Ensure .auth/ directory exists
    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await context.storageState({ path: stateFile });
    console.log(`[global-setup] storageState saved: ${stateFile}`);
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const baseURL = process.env.QA_BASE_URL!;

  // Guards run BEFORE any login. A lock nothing consults is decoration, and this is
  // the last point at which a run about to drive an account it does not hold can
  // still be stopped.
  //
  // global-setup NEVER acquires or reserves a lane itself. It only READS the lock
  // state and verifies the lane is already held. Reserving is the caller's job - the
  // operator, the orchestrator, or the CI job. A global-setup that reserved its own
  // lane would make every accidental run look legitimate.
  guards.assertColdSetupIsIntentional(process.env);

  const laneOnly = process.env.QA_LANE_ONLY;
  if (laneOnly) {
    guards.assertLaneIsLocked(laneOnly, process.env, laneLock);
    guards.assertProjectsMatchLane(laneOnly, _config.projects, process.argv, laneLock);
  }

  for (const laneId of resolveAuthLanes(_config)) {
    const lane = LANE_INFO[laneId];

    // Credentials come from the lane's declared account prefix, e.g. account
    // 'QA_USER4' resolves QA_USER4_EMAIL / QA_USER4_PASSWORD. This is what replaces
    // the old hardcoded QA_USER / QA_USER2 pair and is what lets a lane be added by
    // config alone.
    const emailKey = `${lane.account}_EMAIL`;
    const passwordKey = `${lane.account}_PASSWORD`;

    if (!process.env[emailKey] || !process.env[passwordKey]) {
      throw new Error(
        `[global-setup] Lane ${laneId} (account ${lane.account}) is missing ${emailKey} or ` +
        `${passwordKey}. Every configured lane needs its own credentials, otherwise two lanes ` +
        'end up sharing an account, which is exactly what lanes exist to prevent.'
      );
    }

    const [email, emailSource] = resolveVar(process.env[emailKey], emailKey, 'qa-user@example.com');
    const [password, passwordSource] = resolveVar(process.env[passwordKey], passwordKey, 'CHANGE_ME');
    console.log(`[global-setup] lane ${laneId} (${lane.account}) credentials from ${emailSource} / ${passwordSource}`);

    await loginAs({
      email,
      password,
      baseURL,
      stateFile: lane.storageState,
    });
  }
}
