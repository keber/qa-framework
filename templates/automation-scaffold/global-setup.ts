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
 *   QA_BASE_URL           — Base URL of the application under test
 *   QA_USER_EMAIL         — Default QA user email (or username/RUT)
 *   QA_USER_PASSWORD      — Default QA user password
 *   QA_LOGIN_PATH         — Relative path to the login page (default: /login)
 *   QA_LOGIN_EMAIL_SELECTOR    — CSS selector for the username/email input
 *   QA_LOGIN_PASSWORD_SELECTOR — CSS selector for the password input
 *   QA_LOGIN_SUBMIT_SELECTOR   — CSS selector for the submit button
 *   QA_LOGIN_SUCCESS_SELECTOR  — CSS selector that confirms successful login
 *
 * See .env.example for all supported variables.
 */

import { chromium, FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config();

function resolveVar(param: string | undefined, envKey: string, defaultValue: string): [string, string] {
  if (param !== undefined) {
    return [param, 'param'];
  }
  if (process.env[envKey] !== undefined) {
    return [process.env[envKey]!, `env:${envKey}`];
  }
  return [defaultValue, 'default'];
}

function resolveAuthUsers(config: FullConfig): Set<'1' | '2'> {
  const explicit = process.env.QA_AUTH_USER;
  if (explicit) {
    const resolved = new Set<'1' | '2'>();
    for (const token of explicit.split(',').map((value) => value.trim())) {
      if (token === '1' || token === '2') {
        resolved.add(token);
      }
    }
    if (resolved.size) {
      return resolved;
    }
  }

  const fromProjects = new Set<'1' | '2'>();
  for (const project of config.projects) {
    const storageState = (project.use as { storageState?: unknown } | undefined)?.storageState;
    if (typeof storageState === 'string') {
      if (storageState.includes('user-2')) {
        fromProjects.add('2');
      } else if (storageState.includes('user-1')) {
        fromProjects.add('1');
      }
    }
  }

  if (fromProjects.size) {
    return fromProjects;
  }

  return new Set(['1']);
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
      await page.locator(passwordSelector).fill(password);
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
  const baseURL  = process.env.QA_BASE_URL!;
  const authUsers = resolveAuthUsers(_config);

  if (authUsers.has('1')) {
    const [email, emailSource] = resolveVar(process.env.QA_USER_EMAIL, 'QA_USER_EMAIL', 'qa-user@example.com');
    const [password, passwordSource] = resolveVar(process.env.QA_USER_PASSWORD, 'QA_USER_PASSWORD', 'CHANGE_ME');
    console.log(`[global-setup] user-1 credentials from ${emailSource} / ${passwordSource}`);
    await loginAs({
      email,
      password,
      baseURL,
      stateFile: '.auth/user-default.json',
    });
  }

  if (authUsers.has('2') && process.env.QA_USER2_EMAIL && process.env.QA_USER2_PASSWORD) {
    const [email, emailSource] = resolveVar(process.env.QA_USER2_EMAIL, 'QA_USER2_EMAIL', 'qa-user2@example.com');
    const [password, passwordSource] = resolveVar(process.env.QA_USER2_PASSWORD, 'QA_USER2_PASSWORD', 'CHANGE_ME');
    console.log(`[global-setup] user-2 credentials from ${emailSource} / ${passwordSource}`);
    await loginAs({
      email,
      password,
      baseURL,
      stateFile: '.auth/user-2.json',
    });
  }
}
