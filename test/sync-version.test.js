'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SYNC_PATH = path.join(ROOT, 'scripts', 'sync-version.js');
const CONFIG_PATH = path.join(ROOT, 'qa-framework.config.json');
const README_PATH = path.join(ROOT, 'README.md');
const COPILOT_PATH = path.join(ROOT, '.github', 'copilot-instructions.md');

const VERSION = require(path.join(ROOT, 'package.json')).version;

function runSync() {
  return spawnSync(process.execPath, [SYNC_PATH], { cwd: ROOT, encoding: 'utf8' });
}

// qa-framework.config.json ships to npm and is the template init.js copies into every
// consuming project, where frameworkVersion is injected into {{VERSION}} of the
// generated agent instructions. It drifted to 1.10.0 while the package shipped 1.12.0,
// so every fresh install told its agent the wrong framework version. This test is the
// drift guard: it fails in CI the moment any published surface disagrees with
// package.json, instead of the mismatch reaching npm.
test('sync-version: every published version surface agrees with package.json', () => {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  assert.equal(
    config.frameworkVersion,
    VERSION,
    'qa-framework.config.json frameworkVersion must match package.json'
  );

  for (const filePath of [README_PATH, COPILOT_PATH]) {
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/v\d+\.\d+\.\d+/);
    assert.ok(match, `no version string found in ${filePath}`);
    assert.equal(
      match[0],
      `v${VERSION}`,
      `${path.relative(ROOT, filePath)} must match package.json`
    );
  }
});

test('sync-version: running it on an already synced tree changes nothing', () => {
  const before = fs.readFileSync(CONFIG_PATH, 'utf8');
  const result = runSync();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(CONFIG_PATH, 'utf8'), before);
});

// The repair path: a drifted frameworkVersion must be rewritten in place, keeping the
// surrounding JSON formatting untouched. The original bytes are restored either way.
test('sync-version: a drifted frameworkVersion is rewritten from package.json', () => {
  const before = fs.readFileSync(CONFIG_PATH, 'utf8');
  try {
    const drifted = before.replace(
      /("frameworkVersion"\s*:\s*")\d+\.\d+\.\d+(")/,
      '$10.0.1$2'
    );
    assert.notEqual(drifted, before, 'fixture setup: frameworkVersion field not found');
    fs.writeFileSync(CONFIG_PATH, drifted, 'utf8');

    const result = runSync();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /frameworkVersion -> /);

    const after = fs.readFileSync(CONFIG_PATH, 'utf8');
    assert.equal(JSON.parse(after).frameworkVersion, VERSION);
    assert.equal(after, before, 'only the version field may change');
  } finally {
    fs.writeFileSync(CONFIG_PATH, before, 'utf8');
  }
});

// Guard the contract the script documents: the {{VERSION}} placeholder in the
// instruction templates is substituted per project at install time and must never be
// baked into a concrete version here.
test('sync-version: instruction templates keep the {{VERSION}} placeholder', () => {
  for (const name of ['qa-framework.instructions.md', 'qa-framework.rules.md']) {
    const content = fs.readFileSync(path.join(ROOT, 'templates', name), 'utf8');
    assert.ok(
      content.includes('{{VERSION}}'),
      `templates/${name} must keep the {{VERSION}} placeholder`
    );
  }
});
