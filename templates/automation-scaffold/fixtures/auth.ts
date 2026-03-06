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
 * performance — avoids repeating the login flow on every test).
 * Use loginAs() only in tests that need to validate the login flow itself
 * or switch users mid-test.
 *
 * Supported roles are driven by env vars — see .env.example.
 */

import { Page } from '@playwright/test';

export type QARole = 'default' | 'admin' | 'readonly' | string;

interface LoginConfig {
  email:     string;
  password:  string;
}

/** Map role name → credentials from environment variables */
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
      `Check your .env file — expected ${role.toUpperCase()}_EMAIL and ${role.toUpperCase()}_PASSWORD.`
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
  await page.locator(passwordSelector).fill(password);
  await page.locator(submitSelector).click();
  await page.waitForSelector(successSelector, { timeout: 15_000 });
}
