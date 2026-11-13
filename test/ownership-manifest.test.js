'use strict';

// Unit tests for the ownership manifest encoding and its generator's helpers. The
// generator itself needs git tags (absent in CI's shallow clone), so only its pure
// helpers are exercised here; the generated file is checked by upgrade-ownership.test.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const ownership = require('../scripts/lib/ownership');
const { compareTags } = require('../scripts/build-ownership-manifest');

test('generator: release tags sort by semver precedence', () => {
  const tags = ['v1.14.0', 'v1.10.0', 'v1.14.0-rc.10', 'v1.4.0', 'v1.14.0-rc.2', 'v1.4.0-0', 'v1.9.1'];
  assert.deepEqual(tags.slice().sort(compareTags),
    ['v1.4.0-0', 'v1.4.0', 'v1.9.1', 'v1.10.0', 'v1.14.0-rc.2', 'v1.14.0-rc.10', 'v1.14.0']);
});

test('encoding: every sequence decodes back exactly; shared lines are stored once', () => {
  const base = ['a', 'b', 'c', 'd', 'e'];
  const sequences = [
    ['a', 'b', 'x', 'y', 'd', 'e'],
    ['a', 'x', 'y', 'c'],
    [],
    ['b', 'b', 'z'],
  ];
  const { seqs, extras } = ownership.encodeSequences(base, sequences);
  assert.deepEqual(extras, ['x', 'y', 'z']);
  const table = [...base, ...extras];
  sequences.forEach((seq, i) => assert.deepEqual(ownership.decodeSequence(table, seqs[i]), seq));
});

test('normalization: rendered version, BOM, CRLF and the command marker do not count as edits', () => {
  const rules = '.claude/rules/qa-framework.md';
  const template = '# Rules\n\nThis project uses `@keber/qa-framework` v{{VERSION}} for spec-driven automated testing.\n';
  const rendered = String.fromCodePoint(0xfeff) + template.replace('{{VERSION}}', '1.0.0').replace(/\n/g, '\r\n');
  assert.equal(ownership.normalizeFor(rules, rendered), template);

  const command = '.claude/commands/qa-automation.md';
  assert.equal(ownership.normalizeFor(command, ownership.stampGenerated('Body.\n')), 'Body.\n');
  // Not a stamped file: a version-like string elsewhere is content.
  assert.equal(ownership.normalizeFor('qa/QA-STRUCTURE-GUIDE.md', template.replace('{{VERSION}}', '1.0.0')),
    template.replace('{{VERSION}}', '1.0.0'));
});

test('triage: added lines are relative to the closest version; blank-line ties do not move them', () => {
  const key = 'qa/QA-STRUCTURE-GUIDE.md';
  const v1 = 'one\n\ntwo\n\nthree\n';
  const v2 = 'one\n\ntwo\n\nthree\n\nfour\n';
  const manifestFor = (current, versions) => {
    const base = ownership.lineHashes(current);
    const { seqs, extras } = ownership.encodeSequences(base, versions.map((v) => ownership.lineHashes(v.text)));
    return {
      format: ownership.MANIFEST_FORMAT,
      lineHashChars: ownership.LINE_HASH_CHARS,
      lines: extras.join(''),
      files: {
        [key]: {
          current: ownership.fileHash(current),
          x: [0, extras.length],
          versions: versions.map((v, i) => ({ tags: v.tags, hash: ownership.fileHash(v.text), seq: seqs[i] })),
        },
      },
    };
  };
  const manifest = manifestFor(v2, [{ tags: ['1.0.0'], text: v1 }, { tags: ['2.0.0'], text: v2 }]);

  const edited = 'one\n\nmine\n\ntwo\n\nthree\n';
  const result = ownership.triage(manifest, key, edited, v2);
  assert.equal(result.approximate, false);
  assert.deepEqual(result.tags, ['1.0.0']);
  assert.deepEqual(result.added.map((l) => l.text).filter(Boolean), ['mine']);
  assert.equal(result.missing, 0);

  assert.equal(ownership.classify(manifest, key, v1, v2).state, 'pristine');
  assert.equal(ownership.classify(manifest, key, edited, v2).state, 'edited');
  // A manifest built from other content cannot describe lines: approximate, never wrong.
  const stale = ownership.triage(manifest, key, edited, `${v2}five\n`);
  assert.equal(stale.approximate, true);
});

test('backups: relative path kept, leading dot dropped from the first segment only', () => {
  assert.equal(ownership.backupRelPath('.claude/rules/qa-framework.md'), 'claude/rules/qa-framework.md');
  assert.equal(ownership.backupRelPath('.github/skills/qa-x/SKILL.md'), 'github/skills/qa-x/SKILL.md');
  assert.equal(ownership.backupRelPath('qa/QA-STRUCTURE-GUIDE.md'), 'qa/QA-STRUCTURE-GUIDE.md');
});
