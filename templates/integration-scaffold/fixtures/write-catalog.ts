/**
 * write-catalog.ts - the endpoints the API tests may WRITE, with their approvals.
 *
 * Empty on purpose. Read qa/00-standards/write-safety-policy.md before adding
 * anything: until its section 0 names a write approver, this list stays empty and
 * every test is read-only.
 *
 * A write leaves the test client only when all four gates pass, in this order
 * (scripts/api-guard.js; each failure throws before sending and names its gate):
 *   1. opt-in      QA_API_WRITE=1, set only by `npm run test:write` for that run;
 *                  never in .env, shared configuration or CI defaults.
 *   2. catalog     the endpoint is listed here with a complete approval:
 *                  who, when, scope and how its effect is reverted.
 *                  Scope `forbidden` never passes.
 *   3. exclusions  the path matches no hard exclusion (scripts/hard-exclusions.js
 *                  plus fixtures/project-exclusions.ts). Checked independently of
 *                  this list: adding an excluded endpoint here does not allow it.
 *   4. own record  the test declares the record it targets, named with
 *                  TEST_RECORD_PREFIX, and finds it with pickOwnRecord() (exactly
 *                  one match; an ambiguous lookup fails, it never picks one).
 * Then the environment check of the policy (section 7): the run's QA_BASE_URL host
 * must equal project.qaBaseUrl in qa/qa-framework.config.json, never production.
 *
 * SCOPE (policy section 3)
 *   isolated  - verified: affects only the target entity's own data in the QA system.
 *   syncs     - may replicate to or trigger another system. Needs approval.downstream:
 *               every system it can reach and why each one is not production.
 *               Unknown downstream effect = syncs until proven isolated.
 *   forbidden - never runs from automation. Recorded here so the decision is visible
 *               and is not proposed again. Needs no approval fields.
 *
 * Entry format (example, not active):
 *
 *   {
 *     id: 'example-entity-edit',
 *     name: 'Example entity - edit',
 *     method: 'PUT',
 *     path: 'api/example-entity/{id}',
 *     scope: 'isolated',
 *     approval: {
 *       by: '<write approver named in section 0 of the policy>',
 *       date: 'YYYY-MM-DD',
 *       revert: 'Edit again with the previous value',
 *       // downstream: 'Required for scope syncs: systems reached, all non-production because ...',
 *     },
 *   },
 *
 * Placeholder values such as `<...>` count as missing: an entry copied from this
 * example is rejected at gate 2 until it carries a real approval.
 */

export type WriteScope = 'isolated' | 'syncs' | 'forbidden';

export type WriteEntry = {
  id: string;
  name: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Relative to QA_BASE_URL, no leading slash. `{name}` placeholders are filled from `params`. */
  path: string;
  scope: WriteScope;
  approval?: {
    /** Who approved it: the write approver named in the policy, section 0. */
    by: string;
    /** When, as YYYY-MM-DD. */
    date: string;
    /** How the effect is reverted (there may be no delete: see the policy, section 5). */
    revert: string;
    /** Scope `syncs` only: every downstream system and why it is not production. */
    downstream?: string;
  };
};

/**
 * Prefix of every record the write tests create (gate 4), for example
 * `QA-API-<ENTITY>`. Pick one that no real record can carry.
 */
export const TEST_RECORD_PREFIX = 'QA-API-';

export const WRITE_CATALOG: WriteEntry[] = [];
