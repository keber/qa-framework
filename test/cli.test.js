'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const CLI_PATH = path.join(__dirname, '..', 'scripts', 'cli.js');

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: cwd ?? process.cwd(),
    encoding: 'utf8',
  });
}

test('cli: no arguments prints help and exits 0', () => {
  const result = runCli([]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /qa-framework <command>/);
});

test('cli: --help prints help and exits 0', () => {
  const result = runCli(['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Commands:/);
});

test('cli: -h prints help and exits 0', () => {
  const result = runCli(['-h']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Commands:/);
});

for (const flag of ['--version', '-v']) {
  test(`cli: ${flag} prints the package version and exits 0`, () => {
    const { version } = require('../package.json');
    const result = runCli([flag]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), version);
    assert.equal(result.stderr, '');
  });
}

test('cli: unknown command exits 1 and prints error plus help', () => {
  const result = runCli(['not-a-real-command']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: "not-a-real-command"/);
  assert.match(result.stdout, /Usage:/);
});

for (const [token, suggestion] of [['--upgrade', 'upgrade'], ['upgade', 'upgrade'], ['-validate', 'validate']]) {
  test(`cli: unknown "${token}" suggests "${suggestion}" before the help and exits 1`, () => {
    const result = runCli([token]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`Unknown command: "${token}"`));
    assert.match(result.stderr, new RegExp(`Did you mean "${suggestion}"\\?`));
    assert.match(result.stdout, /Usage:/);
    // Nothing else is printed on stderr after the suggestion, and help follows on stdout.
    assert.ok(result.stderr.trimEnd().endsWith(`Did you mean "${suggestion}"?`), result.stderr);
  });
}

test('cli: an unrelated unknown token gets no suggestion', () => {
  const result = runCli(['not-a-real-command']);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr + result.stdout, /Did you mean/);
});

test('cli: edit distance is the Levenshtein distance', () => {
  const { levenshtein, suggestCommand } = require('../scripts/cli.js');
  assert.equal(levenshtein('', ''), 0);
  assert.equal(levenshtein('upgrade', 'upgrade'), 0);
  assert.equal(levenshtein('upgade', 'upgrade'), 1);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(suggestCommand('--upgrade'), 'upgrade');
  assert.equal(suggestCommand('valdiate'), 'validate');
  assert.equal(suggestCommand('xyz'), null);
  assert.equal(suggestCommand('---'), null);
});

test('cli: known command dispatches to the matching script', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-cli-'));
  try {
    const result = runCli(['validate'], tmpDir);
    assert.match(result.stdout, /\[qa-framework\/validate\]/);
    assert.equal(result.status, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
