'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { scanText } = require('../scripts/check-forbidden-chars.js');

const SKILLS_DIR = path.join(__dirname, '..', 'skills');

// Matches `references/<file>` and `../<skill>/references/<file>` as written in a SKILL.md.
const REFERENCE_RE = /(?:\.\.\/[a-z0-9-]+\/)?references\/[A-Za-z0-9._-]+/g;

function skillDirs() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(SKILLS_DIR, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, 'SKILL.md')));
}

function referencesOf(skillDir) {
  const text = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  return [...new Set(text.match(REFERENCE_RE) || [])];
}

test('every references/ path in a SKILL.md points to an existing file', () => {
  const missing = [];
  for (const dir of skillDirs()) {
    for (const ref of referencesOf(dir)) {
      if (!fs.existsSync(path.join(dir, ref))) {
        missing.push(`${path.relative(SKILLS_DIR, dir)}/SKILL.md -> ${ref}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('qa-ado-integration links the work item full-read protocol', () => {
  const dir = path.join(SKILLS_DIR, 'qa-ado-integration');
  assert.ok(
    referencesOf(dir).includes('references/ado-workitem-full-read-protocol.md'),
    'SKILL.md must reference references/ado-workitem-full-read-protocol.md',
  );
});

test('the work item full-read protocol covers User Story', () => {
  const file = path.join(SKILLS_DIR, 'qa-ado-integration', 'references', 'ado-workitem-full-read-protocol.md');
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /Task,\s+Bug,\s+Issue,\s+or\s+User Story/);
});

test('qa-ado-integration SKILL.md and references pass the forbidden-character check', () => {
  const dir = path.join(SKILLS_DIR, 'qa-ado-integration');
  const files = [
    path.join(dir, 'SKILL.md'),
    ...fs.readdirSync(path.join(dir, 'references')).map((name) => path.join(dir, 'references', name)),
  ];
  const findings = files.flatMap((file) => {
    const raw = fs.readFileSync(file);
    assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), `${file} must not start with a BOM`);
    return scanText(raw.toString('utf8'), path.relative(SKILLS_DIR, file));
  });
  assert.deepEqual(findings, []);
});
