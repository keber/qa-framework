/**
 * read-catalog.ts - the endpoints the API tests may READ.
 *
 * The test client (fixtures/base.ts) rejects, before sending anything, any request
 * that is not listed here with exactly this method and path. A test therefore
 * cannot change data even if someone edits it by mistake.
 *
 * Only queries go here: endpoints with no side effect. An endpoint whose name says
 * "query" but that reserves a number, marks a record as seen, triggers a send or
 * generates a file is a WRITE (qa/00-standards/write-safety-policy.md, section 1)
 * and belongs in write-catalog.ts, behind the write gates.
 *
 * Adding an endpoint:
 *   1. Capture the real call (browser network tools or the API documentation) and
 *      confirm it is a query.
 *   2. Append it at the END of READ_CATALOG, so ids and generated test titles of
 *      existing entries never change.
 *   3. Leave user ids, page ids and download flags out of the path and body.
 *   4. Run `npm test`: tests/security/catalogs.spec.ts checks the catalog offline.
 */

export type ReadEntry = {
  /** Short, stable id used in test titles and evidence attachments. Never reuse one. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** GET, or POST for queries that take their filters in the body (paginated listings). */
  method: 'GET' | 'POST';
  /** Relative to QA_BASE_URL, no leading slash. `{name}` placeholders are filled from `params`. */
  path: string;
  /** Default JSON body for POST queries; a test may pass its own. */
  body?: Record<string, unknown>;
  /** 'required' (default): the API must refuse it without a session. 'none': public by design. */
  auth?: 'required' | 'none';
  /**
   * true only on the framework's example entry. Tests skip placeholder entries with a
   * message, so a new project does not fail against an endpoint it does not have.
   * Delete the example once you add your first real entry.
   */
  placeholder?: true;
};

export const READ_CATALOG: ReadEntry[] = [
  // Example only: replace with a real query of your API (for example a health or
  // "current user" endpoint), then delete `placeholder`.
  { id: 'example-status', name: 'Example status endpoint', method: 'GET', path: 'api/status', auth: 'required', placeholder: true },
];

export function readEntry(id: string): ReadEntry {
  const entry = READ_CATALOG.find((e) => e.id === id);
  if (!entry) throw new Error(`[api] Unknown read catalog id: ${id}`);
  return entry;
}
