/**
 * contract.ts - what every API response of this project must look like.
 *
 * Edit this file once for your API. The default is deliberately generic:
 *
 *   1. Every API response is JSON (`Content-Type: application/json` or `+json`).
 *      Why this is the default: behind a gateway or a single-page app, a route that
 *      does not exist often answers HTTP 200 with the application's HTML page, not
 *      404. "Responds 200" then proves nothing. Requiring JSON turns that false
 *      green into a failure.
 *   2. A request without a session is refused with one of UNAUTHENTICATED_STATUSES,
 *      as JSON, and carries no data.
 *
 * If your backend wraps every response in an envelope, add its check in
 * `assertEnvelope` below. The commented example shows a real-world shape
 * `{ isSucess, data, message, errors }`: note the misspelled `isSucess`. When the
 * API spells a field wrong, the contract uses the API's spelling; do not "fix" it,
 * or every assertion passes vacuously on an undefined field.
 *
 * Assert what the specification requires, not what the API returns today: when the
 * API departs from it, mark the test with test.fail() and open a defect.
 */

import { expect } from '@playwright/test';
import type { ApiResponse } from './base';

/** Status codes the API returns to a request without a session. Many APIs use 401; some use 403. */
export const UNAUTHENTICATED_STATUSES: number[] = [401];

/**
 * Project envelope check. Default: none (any JSON body is accepted).
 *
 * Example to adapt (an envelope with a misspelled success flag):
 *
 *   function assertEnvelope(json: any, label: string): void {
 *     expect(json, `${label}: body is an object`).toEqual(expect.any(Object));
 *     for (const key of ['isSucess', 'data', 'message', 'errors']) {
 *       expect(json, `${label}: envelope has "${key}"`).toHaveProperty(key);
 *     }
 *   }
 */
function assertEnvelope(_json: unknown, _label: string): void {
  // No envelope by default.
}

/** The response is JSON: the first thing to assert on any API call. */
export function expectJson(response: ApiResponse, label = response.endpoint): void {
  expect(
    response.isJson,
    `${label}: expected a JSON response, got Content-Type "${response.contentType}" (status ${response.status}). ` +
      'An HTML body usually means the route does not exist and the app page was served instead.'
  ).toBe(true);
  expect(response.json, `${label}: Content-Type says JSON but the body does not parse`).not.toBeUndefined();
}

/** A successful API response: JSON, 2xx, and the project envelope when there is one. */
export function expectApiResponse(response: ApiResponse, label = response.endpoint): void {
  expectJson(response, label);
  expect(response.status, `${label}: status`).toBeGreaterThanOrEqual(200);
  expect(response.status, `${label}: status`).toBeLessThan(300);
  assertEnvelope(response.json, label);
}

/** A request without a session: refused, as JSON, without data. */
export function expectUnauthenticated(response: ApiResponse, label = response.endpoint): void {
  expect(UNAUTHENTICATED_STATUSES, `${label}: status without a session`).toContain(response.status);
  expectJson(response, label);
  const json = response.json as Record<string, unknown> | undefined;
  if (json && typeof json === 'object' && 'data' in json) {
    expect(json.data ?? null, `${label}: no data without a session`).toBeNull();
  }
}
