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

test('cli: unknown command exits 1 and prints error plus help', () => {
  const result = runCli(['not-a-real-command']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command: "not-a-real-command"/);
  assert.match(result.stdout, /Usage:/);
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
