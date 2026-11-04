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

// The npm `version` lifecycle script runs sync-version.js and then stages what it
// rewrote, so the release commit carries the bumped values. sync-version.js was
// extended to write qa-framework.config.json but the staging list was not, which would
// have left the bumped frameworkVersion unstaged: the tag, and the clean checkout the
// publish workflow builds from, would ship the OLD version - the exact drift this
// change set out to fix. This test derives the list from behaviour: every file
// sync-version.js actually rewrites must appear in the staging command.
test("sync-version: the version lifecycle stages every file sync-version rewrites", () => {
  const WRITTEN = [CONFIG_PATH, README_PATH, COPILOT_PATH];
  const before = new Map(WRITTEN.map(p => [p, fs.readFileSync(p, "utf8")]));

  try {
    fs.writeFileSync(
      CONFIG_PATH,
      before.get(CONFIG_PATH).replace(/("frameworkVersion"s*:s*")d+.d+.d+(")/, "$10.0.1$2"),
      "utf8"
    );
    for (const p of [README_PATH, COPILOT_PATH]) {
      fs.writeFileSync(p, before.get(p).replace(/vd+.d+.d+/, "v0.0.1"), "utf8");
    }

    const result = runSync();
    assert.equal(result.status, 0, result.stdout + result.stderr);

    const versionScript = require(path.join(ROOT, "package.json")).scripts.version;
    for (const p of WRITTEN) {
      const rel = path.relative(ROOT, p).split(path.sep).join("/");
      assert.ok(
        versionScript.includes(rel),
        `package.json "version" script must stage ${rel}, which sync-version.js rewrites`
      );
    }
  } finally {
    for (const [p, content] of before) fs.writeFileSync(p, content, "utf8");
  }
});
