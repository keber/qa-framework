/**
 * API-SEC-001..003 - the test client's own guard. No network: runs on every
 * `npm test`, with or without QA_BASE_URL.
 *
 * The client is built on a transport that records every call, so "rejected before
 * sending anything" is checked, not assumed. If one of these tests fails, nobody
 * should run the suite against QA until it is fixed.
 */

import { test, expect, ApiClient, type Transport } from '../../fixtures/base';
import { READ_CATALOG } from '../../fixtures/read-catalog';

/** A transport that counts calls and never reaches the network. */
function recordingTransport(): Transport & { calls: number } {
  const transport = {
    calls: 0,
    fetch: async () => {
      transport.calls += 1;
      throw new Error('network reached: the guard should have rejected this call before sending');
    },
  };
  return transport as unknown as Transport & { calls: number };
}

test.describe('API - security: read-only guard (no network)', () => {
  test('API-SEC-001 - an endpoint outside the read catalog is rejected before sending @P0', async () => {
    const transport = recordingTransport();
    const client = new ApiClient(transport, 'http://guard.invalid');

    await expect(client.read({ method: 'POST', path: 'api/items/Register' })).rejects.toThrow(/read-catalog: .*not in the read catalog/);
    await expect(client.read('no-such-id')).rejects.toThrow(/read-catalog/);
    expect(transport.calls, 'nothing was sent').toBe(0);
  });

  test('API-SEC-002 - a catalogued path with another method is rejected before sending @P0', async () => {
    const transport = recordingTransport();
    const client = new ApiClient(transport, 'http://guard.invalid');
    const entry = READ_CATALOG[0];
    test.skip(!entry, 'The read catalog is empty.');

    const otherMethod = entry.method === 'GET' ? 'DELETE' : 'PUT';
    await expect(client.read({ method: otherMethod, path: entry.path })).rejects.toThrow(/read-catalog/);
    expect(transport.calls, 'nothing was sent').toBe(0);
  });

  test('API-SEC-003 - a write is rejected at gate 1 when the run did not opt in @P0', async () => {
    test.skip(process.env.QA_API_WRITE === '1', 'This run opted in to writes (npm run test:write).');
    const transport = recordingTransport();
    const client = new ApiClient(transport, 'http://guard.invalid');

    await expect(client.write({ method: 'POST', path: 'api/items/Register' }, { testRecord: 'QA-API-GUARD' })).rejects.toThrow(/gate 1 \(opt-in\)/);
    expect(transport.calls, 'nothing was sent').toBe(0);
  });
});
