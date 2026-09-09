/**
 * fixtures/base.ts
 *
 * Playwright test wrapper with TTL-aware session refresh.
 * Import this file instead of `@playwright/test` when the app uses a
 * server-side session that may expire during long runs.
 */

import { test as base, devices } from '@playwright/test';
import { SESSION_TTL_MS } from '../playwright.config';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const authTimestamps = new Map<string, number>();

function stateFileForProject(storageState: unknown): string {
  if (typeof storageState === 'string' && storageState) {
    return path.resolve(__dirname, '..', storageState);
  }
  return path.resolve(__dirname, '../.auth/user-default.json');
}

function credentialsForState(stateFile: string): { email: string; password: string } {
  if (stateFile.includes('user-2')) {
    return {
      email: process.env.QA_USER2_EMAIL ?? '',
      password: process.env.QA_USER2_PASSWORD ?? '',
    };
  }

  return {
    email: process.env.QA_USER_EMAIL ?? '',
    password: process.env.QA_USER_PASSWORD ?? '',
  };
}

function lastAuthTime(stateFile: string): number {
  if (!authTimestamps.has(stateFile)) {
    try {
      authTimestamps.set(stateFile, fs.statSync(stateFile).mtimeMs);
    } catch {
      authTimestamps.set(stateFile, 0);
    }
  }
  return authTimestamps.get(stateFile) ?? 0;
}

async function reauth(browser: import('@playwright/test').Browser, stateFile: string): Promise<void> {
  const { email, password } = credentialsForState(stateFile);
  const baseURL = process.env.QA_BASE_URL ?? '';
  const loginPath = process.env.QA_LOGIN_PATH ?? '/login';
  const emailSelector = process.env.QA_LOGIN_EMAIL_SELECTOR ?? 'input[type="email"]';
  const passwordSelector = process.env.QA_LOGIN_PASSWORD_SELECTOR ?? 'input[type="password"]';
  const submitSelector = process.env.QA_LOGIN_SUBMIT_SELECTOR ?? 'button[type="submit"]';
  const successSelector = process.env.QA_LOGIN_SUCCESS_SELECTOR ?? '.dashboard, .main-content, [data-testid="app-shell"]';

  const context = await browser.newContext({ ...devices['Desktop Chrome'], baseURL });
  const page = await context.newPage();

  try {
    await page.goto(loginPath, { waitUntil: 'load', timeout: 60_000 });
    await page.locator(emailSelector).fill(email);
    // Trace safety: Playwright records fill() argument values in traces, and this
    // project runs with trace/video 'retain-on-failure'. This reauth path runs for
    // every test whose session exceeded the TTL, so a fill() here would leak the
    // plaintext password into far more failure artifacts than the one-time global
    // setup does. Setting the value through evaluate() keeps it out of the trace.
    // Do not "simplify" this back to fill().
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
    await page.waitForSelector(successSelector, { timeout: 30_000 });

    const dir = path.dirname(stateFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await context.storageState({ path: stateFile });
    authTimestamps.set(stateFile, Date.now());
    console.log(`[session-refresh] storageState renewed: ${stateFile}`);
  } finally {
    await context.close();
  }
}

export const test = base.extend<{ authStatePath: string }>({
  authStatePath: async ({}, use, testInfo) => {
    await use(stateFileForProject(testInfo.project.use.storageState));
  },

  context: async ({ browser }, use, testInfo) => {
    const stateFile = stateFileForProject(testInfo.project.use.storageState);
    if (Date.now() - lastAuthTime(stateFile) > SESSION_TTL_MS) {
      await reauth(browser, stateFile).catch((error) => {
        console.error(`[session-refresh] reauth failed: ${(error as Error).message}`);
      });
    }

    const context = await browser.newContext({
      ...devices['Desktop Chrome'],
      storageState: stateFile,
      baseURL: process.env.QA_BASE_URL,
    });

    await use(context);
    await context.close();
  },
});

export { expect } from '@playwright/test';
export type { Page, Browser, BrowserContext } from '@playwright/test';