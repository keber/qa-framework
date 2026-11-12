/**
 * API-SEC-004..005 - the project's catalogs and exclusions, checked offline on
 * every `npm test`. No network.
 *
 * A malformed entry, a write without a complete approval, a write that a hard
 * exclusion would always block, or a project exclusion that tries to remove a
 * framework pattern fails here, in review, instead of at run time.
 */

import { test, expect } from '../../fixtures/base';
import { READ_CATALOG } from '../../fixtures/read-catalog';
import { WRITE_CATALOG, TEST_RECORD_PREFIX } from '../../fixtures/write-catalog';
import { PROJECT_EXCLUSIONS } from '../../fixtures/project-exclusions';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const guard = require('../../scripts/api-guard.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { FRAMEWORK_EXCLUSIONS } = require('../../scripts/hard-exclusions.js');

test.describe('API - security: catalogs (no network)', () => {
  test('API-SEC-004 - read and write catalogs are well formed and every write is fully approved @P0', () => {
    const problems: string[] = guard.validateCatalogs({
      readCatalog: READ_CATALOG,
      writeCatalog: WRITE_CATALOG,
      projectExclusions: PROJECT_EXCLUSIONS,
      recordPrefix: TEST_RECORD_PREFIX,
    });
    expect(problems, 'catalog problems').toEqual([]);
  });

  test('API-SEC-005 - the effective hard exclusions contain every framework category @P0', () => {
    const effective = guard.effectiveExclusions(PROJECT_EXCLUSIONS).map((g: { category: string }) => g.category);
    for (const category of FRAMEWORK_EXCLUSIONS.map((c: { id: string }) => c.id)) {
      expect(effective, `framework category "${category}"`).toContain(category);
    }
  });
});
