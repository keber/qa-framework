/**
 * example.spec.ts - API integration test example
 *
 * This file shows the basic pattern for API tests using Playwright's
 * APIRequestContext. Replace this with your real tests.
 *
 * The `request` fixture is pre-configured with:
 *   - baseURL from QA_BASE_URL
 *   - storageState from .auth/api-session.json (set by global-setup.ts)
 *
 * For token-based APIs that require an Authorization header, add it
 * explicitly per request or extend the fixture in a fixtures/base.ts file.
 */

import { test, expect } from '@playwright/test';

// Replace with the actual health/status endpoint of your API.
const HEALTH_ENDPOINT = '/health';

test.describe('API smoke tests', () => {

  test('GET health endpoint returns 200', async ({ request }) => {
    const response = await request.get(HEALTH_ENDPOINT);

    expect(response.status()).toBe(200);
  });

  // Example of a test with an Authorization header when QA_API_TOKEN is set.
  // Uncomment and adapt when your API uses Bearer token auth.
  //
  // test('GET protected resource returns 200 with bearer token', async ({ request }) => {
  //   const response = await request.get('/api/me', {
  //     headers: {
  //       Authorization: `Bearer ${process.env.QA_API_TOKEN}`,
  //     },
  //   });
  //
  //   expect(response.status()).toBe(200);
  //   const body = await response.json();
  //   expect(body).toHaveProperty('id');
  // });

});
