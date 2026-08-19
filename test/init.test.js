'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const INIT_PATH = path.join(__dirname, '..', 'scripts', 'init.js');

function runInit(args, cwd) {
  return spawnSync(process.execPath, [INIT_PATH, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}

test('init: bootstraps a default qa/ structure when no config exists', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    const result = runInit([], projectRoot);
    assert.equal(result.status, 0);
    assert.ok(fs.existsSync(path.join(projectRoot, 'qa', 'qa-framework.config.json')));
    assert.ok(fs.existsSync(path.join(projectRoot, 'qa', '00-standards')));
    assert.ok(fs.existsSync(path.join(projectRoot, '.github', 'skills')));
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('init: --skip-if-exists exits 0 without rewriting an already-initialised qa/', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    runInit([], projectRoot);
    const configPath = path.join(projectRoot, 'qa', 'qa-framework.config.json');
    const before = fs.readFileSync(configPath, 'utf8');

    const result = runInit(['--skip-if-exists'], projectRoot);
    assert.equal(result.status, 0);
    assert.match(result.stderr, /already initialised - skipping/);
    assert.equal(fs.readFileSync(configPath, 'utf8'), before);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('init: --config with a missing path exits 1', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    const result = runInit(['--config', 'does-not-exist.json'], projectRoot);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Config file not found/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
