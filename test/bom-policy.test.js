'use strict';

// BOM policy per file type (formatting rules 1-3 of the shipped rule templates).
//
// Windows PowerShell 5.1 reads a BOM-less .ps1 with the system ANSI codepage and
// corrupts every accented literal, so .ps1 files ship WITH a UTF-8 BOM; every other
// file ships WITHOUT one. Four consumer projects had to correct the old "no BOM,
// everywhere" rule by hand.
//
// This is deliberately an internal test and not a checker under scripts/: anything
// under scripts/ is published and becomes a consumer-facing surface with its own
// compatibility contract. The rule text itself is what consumers receive.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { REPO_ROOT, publishedFiles } = require('./helpers/published-files.js');

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const RULE_TEMPLATES = ['templates/qa-framework.instructions.md', 'templates/qa-framework.rules.md'];
const DEV_INSTRUCTIONS = '.github/copilot-instructions.md';

function hasBom(bytes) {
  return bytes.length >= 3 && bytes.subarray(0, 3).equals(BOM);
}

/**
 * Policy violations for a set of files. `read` returns the raw bytes of a path, so
 * the rule can be exercised on synthetic input without touching the repo.
 */
function bomViolations(files, read) {
  return files.flatMap((rel) => {
    const bytes = read(rel);
    if (path.extname(rel).toLowerCase() === '.ps1') {
      return hasBom(bytes) ? [] : [`${rel}: .ps1 must start with a UTF-8 BOM`];
    }
    return hasBom(bytes) ? [`${rel}: must not start with a UTF-8 BOM`] : [];
  });
}

const readRepo = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel));

/** The "Formatting rules for generated content" section, up to the next heading. */
function formattingSection(rel) {
  const text = readRepo(rel).toString('utf8');
  const start = text.indexOf('## Formatting rules for generated content');
  assert.ok(start >= 0, `${rel} has no formatting rules section`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end).replace(/\r\n/g, '\n').trimEnd();
}

test('bomViolations flags a .ps1 without BOM and any other file with one', () => {
  const files = {
    'a.ps1': Buffer.from('Write-Host "descripción"'),
    'b.ps1': Buffer.concat([BOM, Buffer.from('Write-Host "ok"')]),
    'c.md': Buffer.concat([BOM, Buffer.from('# title')]),
    'd.json': Buffer.from('{}'),
    'E.PS1': Buffer.from(''),
  };
  assert.deepEqual(bomViolations(Object.keys(files), (rel) => files[rel]), [
    'a.ps1: .ps1 must start with a UTF-8 BOM',
    'c.md: must not start with a UTF-8 BOM',
    'E.PS1: .ps1 must start with a UTF-8 BOM',
  ]);
});

test('every published file follows the BOM policy for its type', () => {
  const published = publishedFiles();
  // Sanity: without a published .ps1 the .ps1 half of this test would pass vacuously.
  assert.ok(published.some((f) => f.endsWith('.ps1')), 'no published .ps1 file');
  assert.deepEqual(bomViolations(published, readRepo), []);
});

test('the formatting rules section is identical in both shipped rule templates', () => {
  const [instructions, rules] = RULE_TEMPLATES.map(formattingSection);
  assert.equal(rules, instructions);
});

test('the formatting rules carry the per-type BOM policy and the request-body rule', () => {
  for (const rel of [...RULE_TEMPLATES, DEV_INSTRUCTIONS]) {
    const section = formattingSection(rel);
    assert.ok(section.includes('**`.ps1` (PowerShell) files: UTF-8 WITH BOM**'), `${rel}: .ps1 BOM rule missing`);
    assert.ok(section.includes('Windows PowerShell 5.1'), `${rel}: the reason for the .ps1 BOM is missing`);
    assert.ok(section.includes('UTF-8 WITHOUT BOM'), `${rel}: no-BOM rule for other files missing`);
    assert.ok(section.includes('[Text.Encoding]::UTF8.GetBytes($json)'), `${rel}: request-body rule missing`);
    assert.ok(!section.includes('without BOM (`UTF-8`, no signature)'), `${rel}: still carries the old global no-BOM rule`);
  }
});

test('the development rules state the same BOM policy as the shipped templates', () => {
  const policy = (rel) => formattingSection(rel).split('\n').filter((l) => /^(The BOM policy|[123]\. )/.test(l));
  assert.equal(policy(RULE_TEMPLATES[0]).length, 4);
  assert.deepEqual(policy(DEV_INSTRUCTIONS), policy(RULE_TEMPLATES[0]));
});
