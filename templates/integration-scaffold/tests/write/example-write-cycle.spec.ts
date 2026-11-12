/**
 * example-write-cycle.spec.ts - model of a write test. Never loaded by `npm test`;
 * runs only with `npm run test:write`, and skips until fixtures/write-catalog.ts has
 * approved entries with the ids used below.
 *
 * The cycle of qa/00-standards/write-safety-policy.md, section 5, for a system that
 * deactivates instead of deleting. ONE test record per entity, reused across runs:
 *   1. create if absent  - look it up by its exact prefixed name; exactly one: reuse;
 *                          none: create; more than one: fail (gate 4, pickOwnRecord)
 *   2. reactivate        - if a previous run left it inactive
 *   3. exercise          - the write under test (edit one field, assert only it changed)
 *   4. deactivate        - and assert the final state with a separate read
 *   5. always inactive   - afterAll deactivates it even when a step failed, and its
 *                          own failure is reported, never swallowed
 * Cost to declare in the approval: one permanent inactive record per entity.
 *
 * Adapt the ids, paths and body fields to your API; the shapes below are placeholders.
 */

import { test, expect, pickOwnRecord, authenticatedClient, type ApiClient } from '../../fixtures/base';
import { WRITE_CATALOG, TEST_RECORD_PREFIX } from '../../fixtures/write-catalog';
import { READ_CATALOG } from '../../fixtures/read-catalog';
import { expectApiResponse } from '../../fixtures/contract';

const ENTITY = 'EXAMPLE';
const RECORD_NAME = `${TEST_RECORD_PREFIX}${ENTITY}`;

// Ids this example expects in the catalogs. Rename them to your entries.
const LIST_ID = 'example-entity-list';           // read catalog: listing with a name filter
const CREATE_ID = 'example-entity-create';       // write catalog
const ACTIVE_ID = 'example-entity-set-active';   // write catalog: activate / deactivate
const EDIT_ID = 'example-entity-edit';           // write catalog

const ready =
  READ_CATALOG.some((e) => e.id === LIST_ID) &&
  [CREATE_ID, ACTIVE_ID, EDIT_ID].every((id) => WRITE_CATALOG.some((e) => e.id === id));

type Row = { id: number | string; name: string; active: boolean; description?: string };

test.describe.serial(`API - write cycle: ${ENTITY}`, () => {
  test.skip(!ready, `Write catalog has no approved entries ${CREATE_ID}, ${ACTIVE_ID}, ${EDIT_ID} (and read entry ${LIST_ID}). This is a model; adapt it.`);

  let recordId: Row['id'] | undefined;

  async function findOwn(api: ApiClient): Promise<Row | null> {
    const response = await api.read(LIST_ID, { body: { name: RECORD_NAME } });
    expectApiResponse(response);
    const rows = ((response.json as { data?: Row[] })?.data ?? []) as Row[];
    return pickOwnRecord(rows, (r) => r.name, RECORD_NAME); // throws on more than one
  }

  test.afterAll(async () => {
    if (recordId === undefined) return;
    const { client, dispose } = await authenticatedClient();
    try {
      // Step 5: always end inactive. A failure here fails the run; it is not swallowed.
      await client.write(ACTIVE_ID, { testRecord: RECORD_NAME, params: { id: recordId }, body: { active: false } });
    } finally {
      await dispose();
    }
  });

  test('API-WR-001 - create the test record if absent, otherwise reuse it @P1', async ({ api }) => {
    let row = await findOwn(api);
    if (!row) {
      const created = await api.write(CREATE_ID, { testRecord: RECORD_NAME, body: { name: RECORD_NAME, active: true } });
      expectApiResponse(created);
      row = await findOwn(api);
    }
    expect(row, 'exactly one test record exists').not.toBeNull();
    recordId = row!.id;
  });

  test('API-WR-002 - reactivate, edit one field, deactivate @P1', async ({ api }) => {
    expect(recordId, 'record from API-WR-001').not.toBeUndefined();
    const params = { id: recordId! };

    expectApiResponse(await api.write(ACTIVE_ID, { testRecord: RECORD_NAME, params, body: { active: true } }));

    const description = `edited ${new Date().toISOString()}`;
    expectApiResponse(await api.write(EDIT_ID, { testRecord: RECORD_NAME, params, body: { description } }));
    const edited = await findOwn(api);
    expect(edited?.description, 'only the edited field changed').toBe(description);
    expect(edited?.name).toBe(RECORD_NAME);

    expectApiResponse(await api.write(ACTIVE_ID, { testRecord: RECORD_NAME, params, body: { active: false } }));
    const final = await findOwn(api);
    expect(final?.active, 'final state, from a separate read').toBe(false);
  });
});
