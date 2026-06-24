/**
 * global-setup.ts - Integration (API-only) project
 *
 * Runs once before all test files to establish auth state.
 *
 * Two strategies, tried in order:
 *   1. Token-based: QA_API_TOKEN is set -> write a minimal storageState with the
 *      token in localStorage so the `request` fixture picks it up automatically.
 *   2. Browser login: QA_USER_EMAIL + QA_USER_PASSWORD are set -> launch Chromium,
 *      perform the login flow, and save the resulting storageState to
 *      .auth/api-session.json.
 *
 * Playwright's `storageState` mechanism handles cookies and localStorage for
 * APIRequestContext automatically when `use.storageState` is configured.
 * For token-only APIs that require an Authorization header, set the header
 * directly in each test or extend the `request` fixture in fixtures/base.ts.
 */

import * as fs   from 'fs';
import * as path from 'path';
import { chromium } from '@playwright/test';
import * as dotenv  from 'dotenv';

dotenv.config();

const AUTH_FILE = path.join(__dirname, '.auth', 'api-session.json');

export default async function globalSetup(): Promise<void> {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  if (process.env.QA_API_TOKEN) {
    await setupWithToken(process.env.QA_API_TOKEN, process.env.QA_BASE_URL!);
    return;
  }

  await setupWithBrowserLogin();
}

/**
 * Write a minimal storageState that carries the bearer token in localStorage.
 * Replace the localStorage key/value format if your app uses a different scheme
 * (e.g. a cookie, or a different localStorage key name).
 */
async function setupWithToken(token: string, baseURL: string): Promise<void> {
  const origin = baseURL.replace(/\/$/, '');

  const state = {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: 'qa_api_token', value: token },
        ],
      },
    ],
  };

  fs.writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2), 'utf-8');
  console.log('[integration-setup] Token-based auth written to api-session.json');
}

/**
 * Perform a browser login and save the resulting cookies + localStorage to disk.
 *
 * Configure login form selectors via env vars (see .env.example) or update the
 * defaults below to match your application's login page.
 */
async function setupWithBrowserLogin(): Promise<void> {
  const baseURL          = process.env.QA_BASE_URL!.replace(/\/$/, '');
  const email            = process.env.QA_USER_EMAIL!;
  const password         = process.env.QA_USER_PASSWORD!;
  const loginPath        = process.env.QA_LOGIN_PATH              ?? '/login';
  const emailSelector    = process.env.QA_LOGIN_EMAIL_SELECTOR    ?? 'input[type="email"]';
  const passwordSelector = process.env.QA_LOGIN_PASSWORD_SELECTOR ?? 'input[type="password"]';
  const submitSelector   = process.env.QA_LOGIN_SUBMIT_SELECTOR   ?? 'button[type="submit"]';
  const successSelector  = process.env.QA_LOGIN_SUCCESS_SELECTOR  ?? '.dashboard, .main-content, [data-testid="app-shell"]';

  console.log('[integration-setup] Performing browser login...');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page    = await context.newPage();

  try {
    await page.goto(`${baseURL}${loginPath}`, { waitUntil: 'load', timeout: 60_000 });

    await page.locator(emailSelector).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(emailSelector).fill(email);
    await page.locator(passwordSelector).fill(password);
    await page.locator(submitSelector).click();
    await page.waitForSelector(successSelector, { timeout: 60_000 });

    await context.storageState({ path: AUTH_FILE });
    console.log(`[integration-setup] Auth saved: ${AUTH_FILE}`);
  } finally {
    await browser.close();
  }
}
