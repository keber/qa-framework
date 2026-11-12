'use strict';

// Three-tier credential policy and the ADO_PROJECT_READ / ADO_PROJECT_WRITE split
// (survey item B10). Guidance only: a reference of the qa-ado-integration skill,
// linked from its SKILL.md. No script reads these variables yet.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { scanText } = require('../scripts/check-forbidden-chars.js');

const SKILL_DIR = path.join(__dirname, '..', 'skills', 'qa-ado-integration');
const POLICY_PATH = path.join(SKILL_DIR, 'references', 'credential-policy.md');
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');

function readPolicy() {
  return fs.readFileSync(POLICY_PATH, 'utf8');
}

function section(content, heading) {
  const start = content.indexOf(heading);
  assert.ok(start >= 0, `missing heading: ${heading}`);
  const next = content.indexOf('\n## ', start + heading.length);
  return content.slice(start, next < 0 ? undefined : next);
}

test('credential policy: exists, is UTF-8 without BOM and has no forbidden characters', () => {
  const raw = fs.readFileSync(POLICY_PATH);
  assert.ok(raw.length > 0);
  assert.notDeepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.deepEqual(scanText(raw.toString('utf8'), 'credential-policy.md'), []);
});

test('credential policy: qa-ado-integration SKILL.md links it', () => {
  assert.match(fs.readFileSync(SKILL_PATH, 'utf8'), /references\/credential-policy\.md/);
});

test('credential policy: three tiers ordered by lifetime and blast radius, each with a location', () => {
  const tiers = section(readPolicy(), '## 2. Three tiers');
  assert.match(tiers, /lifetime/i);
  assert.match(tiers, /blast radius/i);
  for (const tier of ['Identity', 'Context', 'Secrets']) {
    assert.match(tiers, new RegExp(`\\| \\*\\*${tier}\\*\\* \\|`), `missing tier row: ${tier}`);
  }
  // Context is versioned and holds names, never values.
  assert.match(tiers, /qa-framework\.config\.json/);
  assert.match(tiers, /names/i);
});

test('credential policy: says where each tier lives locally and in CI', () => {
  const where = section(readPolicy(), '## 3. Where each tier lives');
  assert.match(where, /environment variable/i);
  assert.match(where, /gitignored/i);
  assert.match(where, /vault/i);
  assert.match(where, /pipeline secret|secret variable/i);
});

test('credential policy: least privilege, including the read/write split of the PAT scope', () => {
  const content = readPolicy();
  assert.match(content, /least privilege/i);
  const split = section(content, '## 5. Read and write access');
  for (const name of ['ADO_PROJECT_READ', 'ADO_PROJECT_WRITE', 'ADO_PAT_READ', 'ADO_PAT_WRITE']) {
    assert.match(split, new RegExp(`\`${name}\``), `split section does not name ${name}`);
  }
  // Read-only tooling must never hold write scope.
  assert.match(split, /read-only tooling/i);
  assert.match(split, /never/i);
  // A project name is a target, not an access control.
  assert.match(split, /not an access control/i);
  // The current single-variable names stay valid as a fallback.
  assert.match(split, /`ADO_PROJECT`/);
  assert.match(split, /`ADO_PAT`/);
});

test('credential policy: rotation section covers expiry, single point of change and revocation', () => {
  const rotation = section(readPolicy(), '## 6. Rotation');
  assert.match(rotation, /expir/i);
  assert.match(rotation, /revoke/i);
  assert.match(rotation, /one (line|file|place)/i);
});

test('credential policy: hard rules forbid persisted secrets, copies into worktrees and printing values', () => {
  const rules = section(readPolicy(), '## 7. Hard rules');
  assert.match(rules, /HKCU\\Environment/);
  assert.match(rules, /worktree/i);
  assert.match(rules, /by name/i);
  assert.match(rules, /never by value|never the value|not values/i);
});

test('credential policy: contains no consumer-project specifics or real endpoints', () => {
  const content = readPolicy();
  const denylist = [
    /garc[eé]s/i, /biofruit/i, /enrolamiento/i, /sispro/i, /gmo/i, /exportadora/i,
    /nexus/i, /bioacsys/i, /\bgf-/, /keber\.flores/i, /dev\.azure\.com\/[a-z0-9]/i,
    /https?:\/\//,
  ];
  for (const pattern of denylist) {
    assert.doesNotMatch(content, pattern, `reference leaks ${pattern}`);
  }
});
