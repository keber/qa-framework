'use strict';

/**
 * scripts/lib/integration-guard-files.js - the API guard set of the integration
 * scaffold (read-only client and write gates, qa/00-standards/write-safety-policy.md),
 * as `upgrade` delivers it to existing projects. Paths are relative to
 * qa/07-automation/integration/ and to templates/integration-scaffold/.
 *
 * owner
 *   'framework'  framework logic. Installed when missing, refreshed while its
 *                normalised hash is one the framework shipped, otherwise left alone
 *                with a warning. Hashes live in SHIPPED_SCAFFOLD_HASHES (upgrade.js).
 *   'user'       the project's from day one: catalogs, exclusions, the response
 *                contract and the tests. Installed when missing, never touched once
 *                they exist. Exception: `refreshWhenPristine` (an untouched copy of an
 *                older release is refreshed; used for tests/example.spec.ts, whose
 *                pre-1.14 version fails with "invalid URL" against the 1.14 config).
 *
 * deps
 *   Every scaffold file this file imports or require()s, plus `playwright.config.ts`
 *   where the file relies on the config's behaviour (tests/write/ is excluded from
 *   `npm test` by the config, not by itself). A file is delivered only when every
 *   dep will be the framework's version after the upgrade, so no installed file can
 *   import something missing or foreign. test/upgrade.test.js checks these lists
 *   against the actual imports of the templates.
 *
 * Order matters: a file comes after the files it depends on.
 */

const INTEGRATION_GUARD_FILES = Object.freeze([
  { rel: 'scripts/hard-exclusions.js', owner: 'framework', deps: [] },
  { rel: 'scripts/api-guard.js', owner: 'framework', deps: ['scripts/hard-exclusions.js'] },
  { rel: 'scripts/run-write-tests.js', owner: 'framework', deps: ['scripts/api-guard.js'] },
  { rel: 'fixtures/read-catalog.ts', owner: 'user', deps: [] },
  { rel: 'fixtures/write-catalog.ts', owner: 'user', deps: [] },
  { rel: 'fixtures/project-exclusions.ts', owner: 'user', deps: [] },
  {
    rel: 'fixtures/base.ts',
    owner: 'framework',
    deps: ['fixtures/read-catalog.ts', 'fixtures/write-catalog.ts', 'fixtures/project-exclusions.ts', 'scripts/api-guard.js'],
  },
  { rel: 'fixtures/contract.ts', owner: 'user', deps: ['fixtures/base.ts'] },
  {
    rel: 'tests/example.spec.ts',
    owner: 'user',
    refreshWhenPristine: true,
    deps: ['fixtures/base.ts', 'fixtures/read-catalog.ts', 'fixtures/contract.ts'],
  },
  {
    rel: 'tests/security/read-only-guard.spec.ts',
    owner: 'user',
    deps: ['fixtures/base.ts', 'fixtures/read-catalog.ts'],
  },
  {
    rel: 'tests/security/catalogs.spec.ts',
    owner: 'user',
    deps: [
      'fixtures/base.ts',
      'fixtures/read-catalog.ts',
      'fixtures/write-catalog.ts',
      'fixtures/project-exclusions.ts',
      'scripts/api-guard.js',
      'scripts/hard-exclusions.js',
    ],
  },
  {
    rel: 'tests/security/no-session.spec.ts',
    owner: 'user',
    deps: ['fixtures/base.ts', 'fixtures/read-catalog.ts', 'fixtures/contract.ts'],
  },
  {
    rel: 'tests/write/example-write-cycle.spec.ts',
    owner: 'user',
    deps: [
      'fixtures/base.ts',
      'fixtures/write-catalog.ts',
      'fixtures/read-catalog.ts',
      'fixtures/contract.ts',
      'playwright.config.ts',
    ],
  },
].map((entry) => Object.freeze({ ...entry, deps: Object.freeze([...entry.deps]) })));

module.exports = { INTEGRATION_GUARD_FILES };
