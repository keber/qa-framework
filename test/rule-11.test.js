'use strict';

// Rule 11 (character encoding safety) guards.
//
// Part 1 - the rule text. Consumer projects measured a 98-99% incidence of
// accent-free Spanish in agent-generated artifacts: the rule as shipped only said
// which characters NOT to use, so agents read it as "produce ASCII" and sub-agents
// that received a restated copy reported compliance on stripped text. The rule now
// carries the mandatory orthography half, the propagation clause and a verification
// clause that names the shipped checkers; these tests keep all of it in both files.
//
// Part 2 - everything the package publishes. Version 1.10.0 shipped
// templates/qa-framework.instructions.md with em-dashes, violating the very rule the
// file declares. This walks the real `npm pack` file list, so a new folder added to
// `files` in package.json is covered without editing this test.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { scanText } = require('../scripts/check-forbidden-chars.js');
const { REPO_ROOT, publishedFiles } = require('./helpers/published-files.js');

const RULE_FILES = [
  path.join(REPO_ROOT, 'templates', 'qa-framework.instructions.md'),
  path.join(REPO_ROOT, 'templates', 'qa-framework.rules.md'),
];
const CONSUMER_SCRIPTS = 'node_modules/@keber/qa-framework/scripts/';

function rule11(file) {
  const line = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('11. '));
  assert.ok(line, `${path.basename(file)} has no rule 11`);
  return line;
}

test('rule 11 is identical in instructions.md and rules.md', () => {
  const [instructions, rules] = RULE_FILES.map(rule11);
  assert.equal(rules, instructions);
});

test('rule 11 keeps its title and the forbidden-character half', () => {
  const text = rule11(RULE_FILES[0]);
  assert.match(text, /^11\. \*\*Character encoding safety \(BLOCKING\):\*\*/);
  for (const cp of ['U+2014', 'U+2013', 'U+2026', 'U+201C', 'U+201D', 'U+2018', 'U+2019', 'U+2190-U+21FF']) {
    assert.ok(text.includes(cp), `rule 11 no longer names ${cp}`);
  }
});

test('rule 11 makes correct orthography mandatory and ties it to conventions.language', () => {
  const text = rule11(RULE_FILES[0]);
  assert.match(text, /MUST be written correctly in that language/);
  assert.ok(text.includes('`conventions.language`'), 'rule 11 must point at conventions.language');
  assert.ok(text.includes('U+00C0-U+024F'), 'rule 11 must keep the Latin Extended range');
  assert.ok(text.includes('á é í ó ú ñ ü'), 'the Spanish case must stay explicit');
  assert.match(text, /NOT an instruction to produce ASCII-only output/);
});

test('rule 11 carries the propagation clause', () => {
  const text = rule11(RULE_FILES[0]);
  assert.match(text, /sub-agent prompt, skill, agent definition or rubric, carry both halves/);
});

test('rule 11 defines verification as running the shipped checkers', () => {
  const text = rule11(RULE_FILES[0]);
  const published = publishedFiles();
  for (const script of ['check-forbidden-chars.js', 'check-spanish-accents.js']) {
    assert.ok(text.includes(`node ${CONSUMER_SCRIPTS}${script}`), `rule 11 must give the consumer path of ${script}`);
    assert.ok(published.includes(`scripts/${script}`), `scripts/${script} is named by rule 11 but not published`);
  }
  assert.match(text, /never asserting compliance/);
});

test('every published text file passes the forbidden-character check', () => {
  const published = publishedFiles();
  // Sanity: the folders an agent reads must actually be in the list, or an empty
  // pack result would make this test pass vacuously.
  for (const prefix of ['templates/', 'skills/', 'docs/']) {
    assert.ok(published.some((f) => f.startsWith(prefix)), `no published file under ${prefix}`);
  }

  const findings = published.flatMap((rel) => {
    const raw = fs.readFileSync(path.join(REPO_ROOT, rel));
    if (raw.includes(0)) return []; // binary
    return scanText(raw.toString('utf8'), rel).map((f) => `${f.file}:${f.line}:${f.column} ${f.name}`);
  });
  assert.deepEqual(findings, []);
});
