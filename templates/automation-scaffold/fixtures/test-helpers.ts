/**
 * fixtures/test-helpers.ts
 *
 * Utility functions used across all spec files.
 * Import only what you need; keep specs self-contained.
 */

// -----------------------------------------------------------------------
// EXEC_IDX — unique numeric seed per minute-long execution window
// -----------------------------------------------------------------------
// Use this wherever test data needs to be unique (e.g., names, emails,
// codes) to avoid collisions between parallel or consecutive test runs
// without relying on random values that are impossible to correlate.
//
// Example:
//   const idx = execIdx();    // e.g., 42591
//   const name = `QA-Supplier-${idx}`;
// -----------------------------------------------------------------------
export function execIdx(): number {
  return Math.floor(Date.now() / 60_000) % 100_000;
}

/** Date string formatted as YYYY-MM-DD in local time. */
export function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

/** Date string formatted as DD/MM/YYYY (common in Spanish-language UIs). */
export function todayDMY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Future date offset by `days` from today, formatted as YYYY-MM-DD. */
export function futureDateISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------
// 3-layer email assertion helper
// -----------------------------------------------------------------------
// Use this when asserting an email field value to avoid brittle exact-match
// assertions that break when display format changes.
//
// Example:
//   await assertEmailContains(
//     await page.locator('#email-cell').textContent() ?? '',
//     process.env.QA_USER_EMAIL!
//   );
// -----------------------------------------------------------------------
export function assertEmailContains(
  actual: string,
  expected: string
): void {
  const localPart = expected.split('@')[0];
  const domain    = expected.split('@')[1];
  if (!actual.includes(localPart)) {
    throw new Error(`Email assertion failed: expected local part "${localPart}" in "${actual}"`);
  }
  if (!actual.includes(domain)) {
    throw new Error(`Email assertion failed: expected domain "${domain}" in "${actual}"`);
  }
  if (!actual.includes('@')) {
    throw new Error(`Email assertion failed: no "@" symbol found in "${actual}"`);
  }
}

// -----------------------------------------------------------------------
// Unique test string builder
// -----------------------------------------------------------------------
// Combines a readable prefix with EXEC_IDX for easy triage in QA data.
// -----------------------------------------------------------------------
export function uniqueName(prefix: string): string {
  return `${prefix}-${execIdx()}`;
}

/** Unique email address for test isolation (uses execIdx). */
export function uniqueEmail(domain = 'qa-test.example.com'): string {
  return `qa-user-${execIdx()}@${domain}`;
}
