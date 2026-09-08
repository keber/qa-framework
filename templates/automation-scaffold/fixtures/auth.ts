/**
 * fixtures/auth.ts
 *
 * Provides a `loginAs(page, role)` helper that navigates the login form
 * and waits for successful authentication.
 *
 * Usage in spec files:
 *   import { loginAs } from '../../fixtures/auth';
 *   // inside a test:
 *   await loginAs(page, 'admin');
 *
 * Alternatively, use storageState via global-setup.ts (recommended for
 * performance - avoids repeating the login flow on every test).
 * Use loginAs() only in tests that need to validate the login flow itself
 * or switch users mid-test.
 *
 * Supported roles are driven by env vars - see .env.example.
 */

import { Page } from '@playwright/test';

export type QARole = 'default' | 'admin' | 'readonly' | string;

interface LoginConfig {
  email:     string;
  password:  string;
}

/** Map role name -> credentials from environment variables */
function getCredentials(role: QARole): LoginConfig {
  switch (role) {
    case 'admin':
      return {
        email:    process.env.QA_ADMIN_EMAIL    ?? '',
        password: process.env.QA_ADMIN_PASSWORD ?? '',
      };
    case 'readonly':
      return {
        email:    process.env.QA_READONLY_EMAIL    ?? '',
        password: process.env.QA_READONLY_PASSWORD ?? '',
      };
    case 'default':
    default:
      return {
        email:    process.env.QA_USER_EMAIL    ?? '',
        password: process.env.QA_USER_PASSWORD ?? '',
      };
  }
}

/**
 * Navigate to the login page and authenticate as the given role.
 * Waits for the post-login success selector before resolving.
 */
export async function loginAs(page: Page, role: QARole = 'default'): Promise<void> {
  const { email, password } = getCredentials(role);

  if (!email || !password) {
    throw new Error(
      `[qa-framework/auth] Missing credentials for role "${role}". ` +
      `Check your .env file - expected ${role.toUpperCase()}_EMAIL and ${role.toUpperCase()}_PASSWORD.`
    );
  }

  const loginPath        = process.env.QA_LOGIN_PATH               ?? '/login';
  const emailSelector    = process.env.QA_LOGIN_EMAIL_SELECTOR      ?? 'input[type="email"]';
  const passwordSelector = process.env.QA_LOGIN_PASSWORD_SELECTOR   ?? 'input[type="password"]';
  const submitSelector   = process.env.QA_LOGIN_SUBMIT_SELECTOR     ?? 'button[type="submit"]';
  const successSelector  = process.env.QA_LOGIN_SUCCESS_SELECTOR    ?? '.dashboard';
  const baseURL          = process.env.QA_BASE_URL                  ?? '';

  await page.goto(`${baseURL}${loginPath}`, { waitUntil: 'domcontentloaded' });
  await page.locator(emailSelector).fill(email);
  // Trace safety: Playwright records fill() argument values in traces, and this
  // project runs with trace/video 'retain-on-failure'. This helper runs for every
  // test that logs in as a role, so a fill() here would leak the plaintext password
  // into far more failure artifacts than the one-time global setup does. Setting the
  // value through evaluate() keeps it out of the trace.
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
  await page.waitForSelector(successSelector, { timeout: 15_000 });
}
