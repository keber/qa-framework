'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const CHECK_PATH = path.join(__dirname, '..', 'scripts', 'check-forbidden-chars.js');
const { scanText } = require('../scripts/check-forbidden-chars.js');

// The forbidden characters are built from escape sequences on purpose: this test
// file is itself scanned by the checker it exercises, so it must stay clean.
const EM_DASH = '\u2014';
const EN_DASH = '\u2013';
const ELLIPSIS = '\u2026';
const LDQUO = '\u201C';
const RDQUO = '\u201D';
const LSQUO = '\u2018';
const RSQUO = '\u2019';
const ARROW_RIGHT = '\u2192';
const ARROW_LEFT = '\u2190';
const ARROW_EXOTIC = '\u21C4';

function runCheck(args, cwd) {
  return spawnSync(process.execPath, [CHECK_PATH, ...args], { cwd, encoding: 'utf8' });
}

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-chars-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

test('detects every forbidden character class', () => {
  const cases = [
    [EM_DASH, 0x2014],
    [EN_DASH, 0x2013],
    [ELLIPSIS, 0x2026],
    [LDQUO, 0x201c],
    [RDQUO, 0x201d],
    [LSQUO, 0x2018],
    [RSQUO, 0x2019],
    [ARROW_RIGHT, 0x2192],
    [ARROW_LEFT, 0x2190],
    [ARROW_EXOTIC, 0x21c4],
  ];

  for (const [char, codePoint] of cases) {
    const findings = scanText(`a ${char} b`, 'sample.md');
    assert.equal(findings.length, 1, `expected one finding for ${codePoint.toString(16)}`);
    assert.equal(findings[0].codePoint, codePoint);
  }
});

test('suggests the ASCII replacement for each class', () => {
  assert.equal(scanText(EM_DASH, 'f.md')[0].replacement, ' - ');
  assert.equal(scanText(EN_DASH, 'f.md')[0].replacement, ' - ');
  assert.equal(scanText(ELLIPSIS, 'f.md')[0].replacement, '...');
  assert.equal(scanText(LDQUO, 'f.md')[0].replacement, '"');
  assert.equal(scanText(RSQUO, 'f.md')[0].replacement, "'");
  assert.equal(scanText(ARROW_RIGHT, 'f.md')[0].replacement, '->');
  assert.equal(scanText(ARROW_LEFT, 'f.md')[0].replacement, '<-');
});

test('reports 1-based line and column', () => {
  const findings = scanText(`first line\nok ${EM_DASH} here`, 'f.md');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 2);
  assert.equal(findings[0].column, 4);
});

test('Spanish accented characters are not flagged', () => {
  const spanish = 'Ejecución de la validación de código para el múltiple año, con ñ y ü.';
  assert.deepEqual(scanText(spanish, 'spec.md'), []);
});

test('the whole Latin Extended range is not flagged', () => {
  let text = '';
  for (let cp = 0x00c0; cp <= 0x024f; cp += 1) text += String.fromCodePoint(cp);
  assert.deepEqual(scanText(text, 'spec.md'), []);
});

test('emoji are not flagged', () => {
  assert.deepEqual(scanText('✅ passed \u{1F600} ⚠️', 'report.md'), []);
});

test('ASCII replacements are themselves clean', () => {
  assert.deepEqual(scanText('a - b ... "q" \'s\' -> <-', 'f.md'), []);
});

test('scans .js files, not just .md', () => {
  const file = tmpFile('gen.js', `// note ${EM_DASH} here\n`);
  const run = runCheck([file]);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /U\+2014/);
});

test('scans .ts files', () => {
  const file = tmpFile('config.ts', `export const label = '${ARROW_RIGHT}';\n`);
  const run = runCheck([file]);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /U\+2192/);
});

test('ignores files with an unscanned extension', () => {
  const file = tmpFile('data.json', `{"note": "${EM_DASH}"}`);
  const run = runCheck([file]);
  assert.equal(run.status, 0);
});

test('exits 0 on a clean file', () => {
  const file = tmpFile('clean.md', '# Title\n\nPlain ASCII prose with acentuación.\n');
  const run = runCheck([file]);
  assert.equal(run.status, 0);
});

test('exits 1 on a violation', () => {
  const file = tmpFile('dirty.md', `# Memory Index ${EM_DASH} Project\n`);
  const run = runCheck([file]);
  assert.equal(run.status, 1);
});

test('exits 2 with no arguments', () => {
  const run = runCheck([]);
  assert.equal(run.status, 2);
});

test('--report never fails, even on a violation', () => {
  const file = tmpFile('dirty.md', `Text ${ELLIPSIS} more\n`);
  const run = runCheck(['--report', file]);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /U\+2026/);
});

test('skips node_modules when scanning a directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-chars-dir-'));
  fs.mkdirSync(path.join(dir, 'node_modules'));
  fs.writeFileSync(path.join(dir, 'node_modules', 'bad.md'), EM_DASH, 'utf8');
  fs.writeFileSync(path.join(dir, 'good.md'), 'clean\n', 'utf8');
  const run = runCheck([dir]);
  assert.equal(run.status, 0, run.stderr);
});

// Pins Part 1 of the character-safety fix: scripts/ writes template literals and
// console output into every consuming project, so a regression there propagates.
// templates/, skills/ and test/ still carry legacy violations by design of this
// scoped change and are a documented follow-up, so they are not asserted here.
test('the package\'s own scripts/ and test/ are clean', () => {
  const root = path.join(__dirname, '..');
  const run = runCheck(['scripts', 'test'], root);
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
