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
    await page.goto(`${baseURL}${loginPath}`, { waitUntil: 'domcontentloaded' });
    await page.locator(emailSelector).fill(email);
    await page.locator(passwordSelector).fill(password);
    await page.locator(submitSelector).click();
    await page.waitForSelector(successSelector, { timeout: 15_000 });

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
  const email    = process.env.QA_USER_EMAIL!;
  const password = process.env.QA_USER_PASSWORD!;

  // --- Default role login ---
  await loginAs({
    email,
    password,
    baseURL,
    stateFile: '.auth/user-default.json',
  });

  // --- Additional roles (uncomment and adapt as needed) ---
  // await loginAs({
  //   email:     process.env.QA_ADMIN_EMAIL!,
  //   password:  process.env.QA_ADMIN_PASSWORD!,
  //   baseURL,
  //   stateFile: '.auth/user-admin.json',
  // });
  //
  // await loginAs({
  //   email:     process.env.QA_READONLY_EMAIL!,
  //   password:  process.env.QA_READONLY_PASSWORD!,
  //   baseURL,
  //   stateFile: '.auth/user-readonly.json',
  // });
}
