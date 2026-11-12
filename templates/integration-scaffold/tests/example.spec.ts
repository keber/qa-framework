/**
 * example.spec.ts - the basic pattern of a read test. Replace it with your tests.
 *
 * Use the fixtures of fixtures/base.ts, not Playwright's raw `request`:
 *   - `api.read(id)` only reaches endpoints of fixtures/read-catalog.ts;
 *   - `expectApiResponse` (fixtures/contract.ts) asserts JSON first, because a
 *     gateway or SPA can answer an unknown route with HTTP 200 and an HTML page.
 *
 * Skipped when QA_BASE_URL is not set, and while the catalog entry is still the
 * framework placeholder.
 */

import { test, expect } from '../fixtures/base';
import { READ_CATALOG } from '../fixtures/read-catalog';
import { expectApiResponse } from '../fixtures/contract';

const entry = READ_CATALOG.find((e) => e.id === 'example-status');

test.describe('API - example', () => {
  // Declared before the test so it is evaluated before the `api` fixture is built.
  test.skip(!entry || !!entry.placeholder, 'fixtures/read-catalog.ts has no real "example-status" entry. Point this test at a real endpoint.');

  test('API-EX-001 - the example endpoint answers with a JSON success @P1', async ({ api }) => {
    const response = await api.read(entry!.id);
    expectApiResponse(response);
    expect(response.ms, 'reference time, not an SLA').toBeLessThan(10_000);
  });
});
