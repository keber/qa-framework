/**
 * API-SEC-010 - without a session the API refuses every endpoint that requires one.
 *
 * Read only: calls endpoints of the read catalog with no cookie and no token.
 * Skipped when QA_BASE_URL is not set, or while the catalog only holds the
 * framework's placeholder entry.
 *
 * The expected status is UNAUTHENTICATED_STATUSES in fixtures/contract.ts (401 by
 * default). The response must also be JSON: an app that serves its HTML page for
 * any route would otherwise pass a "not 200" check with a false green.
 */

import { test } from '../../fixtures/base';
import { READ_CATALOG } from '../../fixtures/read-catalog';
import { expectUnauthenticated } from '../../fixtures/contract';

const protectedEndpoints = READ_CATALOG.filter((e) => (e.auth ?? 'required') === 'required' && !e.placeholder);

test.describe('API - security: no session', () => {
  test.skip(
    protectedEndpoints.length === 0,
    'No real protected endpoint in fixtures/read-catalog.ts yet (only the placeholder). Add one to run this test.',
  );

  test('API-SEC-010 - without a session, protected endpoints are refused as JSON, without data @P0', async ({ anonymous }) => {
    for (const entry of protectedEndpoints) {
      const response = await anonymous.read(entry.id);
      expectUnauthenticated(response, entry.id);
    }
  });
});
