'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  moduleSpecDirName,
  submoduleSpecDirName,
  moduleBareName,
  submoduleBareName,
} = require('../scripts/lib/module-keys');

// The spec tree and the automation tree name the same module differently. Keeping that
// difference in one module is what stops init.js and validate.js from drifting apart
// again, which is exactly how the scaffold ended up contradicting the agent rules.

test('module-keys: a bare key gains the spec prefix', () => {
  assert.equal(moduleSpecDirName('suppliers'), 'module-suppliers');
  assert.equal(submoduleSpecDirName('create'), 'submodule-create');
});

test('module-keys: prefixing is idempotent', () => {
  assert.equal(moduleSpecDirName('module-suppliers'), 'module-suppliers');
  assert.equal(submoduleSpecDirName('submodule-create'), 'submodule-create');
});

test('module-keys: the bare name strips the prefix when present', () => {
  assert.equal(moduleBareName('module-suppliers'), 'suppliers');
  assert.equal(submoduleBareName('submodule-create'), 'create');
});

test('module-keys: the bare name leaves an unprefixed key untouched', () => {
  assert.equal(moduleBareName('suppliers'), 'suppliers');
  assert.equal(submoduleBareName('create'), 'create');
});

// A module legitimately named "modules" or "submodule-flows" must not lose a segment
// because its name merely starts with the prefix letters. Only an exact "module-" /
// "submodule-" marker counts.
test('module-keys: only an exact prefix marker is stripped', () => {
  assert.equal(moduleBareName('modules'), 'modules');
  assert.equal(moduleBareName('modulo-operacion'), 'modulo-operacion');
  assert.equal(submoduleBareName('submodules'), 'submodules');
});

// Round-trip: whatever the config spells, the pair of helpers must agree.
test('module-keys: spec name and bare name round-trip', () => {
  for (const key of ['suppliers', 'module-suppliers', 'operacion']) {
    assert.equal(moduleSpecDirName(moduleBareName(key)), moduleSpecDirName(key));
    assert.equal(moduleBareName(moduleSpecDirName(key)), moduleBareName(key));
  }
});
