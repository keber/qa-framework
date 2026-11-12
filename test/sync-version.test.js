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
const { syncVersion, PROSE_PATTERN, fieldPattern } = require(SYNC_PATH);
const FIELD_PATTERN = fieldPattern('frameworkVersion');

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
    const match = content.match(PROSE_PATTERN);
    assert.ok(match, `no version string found in ${filePath}`);
    assert.equal(
      match[0],
      `v${VERSION}`,
      `${path.relative(ROOT, filePath)} must match package.json`
    );
  }
});

// Idempotence, checked without assuming the tree is already synced and without leaving
// it modified. The previous version ran sync-version once and compared against the
// starting bytes, so on a drifted tree it REPAIRED qa-framework.config.json as a side
// effect: the first run failed, the retry passed, and the drift vanished from the
// working tree unnoticed. A suite that edits tracked files turns a red run green on
// the retry and hides the very thing it exists to catch. Normalise first, then assert
// the second run is a no-op, and restore every file sync-version can write.
test('sync-version: a second run on a synced tree changes nothing', () => {
  const TOUCHED = [CONFIG_PATH, README_PATH, COPILOT_PATH];
  const before = new Map(TOUCHED.map(p => [p, fs.readFileSync(p, 'utf8')]));

  try {
    const first = runSync();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const synced = new Map(TOUCHED.map(p => [p, fs.readFileSync(p, 'utf8')]));

    const second = runSync();
    assert.equal(second.status, 0, second.stdout + second.stderr);
    for (const p of TOUCHED) {
      assert.equal(
        fs.readFileSync(p, 'utf8'),
        synced.get(p),
        `${path.relative(ROOT, p)} changed on the second run`
      );
    }
  } finally {
    for (const [p, content] of before) fs.writeFileSync(p, content, 'utf8');
  }
});

// The repair path: a drifted frameworkVersion must be rewritten in place, keeping the
// surrounding JSON formatting untouched. The original bytes are restored either way.
test('sync-version: a drifted frameworkVersion is rewritten from package.json', () => {
  const before = fs.readFileSync(CONFIG_PATH, 'utf8');
  try {
    const drifted = before.replace(FIELD_PATTERN, '$10.0.1$2');
    assert.notEqual(drifted, before, 'fixture setup: frameworkVersion field not found');
    fs.writeFileSync(CONFIG_PATH, drifted, 'utf8');

    const result = runSync();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /frameworkVersion -> /);

    const after = fs.readFileSync(CONFIG_PATH, 'utf8');
    assert.equal(JSON.parse(after).frameworkVersion, VERSION);

    // Compare against the starting bytes with only the version field substituted, not
    // against the starting bytes themselves: the tree may legitimately start drifted
    // (mid-release, or on a branch that bumped package.json), and this test is about
    // sync-version touching nothing else - not about where the tree happened to be.
    const expected = before.replace(FIELD_PATTERN, `$1${VERSION}$2`);
    assert.equal(after, expected, 'only the version field may change');
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
      before.get(CONFIG_PATH).replace(FIELD_PATTERN, "$10.0.1$2"),
      "utf8"
    );
    for (const p of [README_PATH, COPILOT_PATH]) {
      fs.writeFileSync(p, before.get(p).replace(PROSE_PATTERN, "v0.0.1"), "utf8");
    }
    // The drift above must actually land, or this test proves nothing: it used to
    // build these patterns with unescaped `d+` / `s*`, matched nothing, and so
    // never exercised the rewrite it claims to check.
    assert.equal(JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")).frameworkVersion, "0.0.1");

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

// --- Prerelease sequence -----------------------------------------------------------
// The release model publishes X.Y.Z-rc.N under `next` and later promotes X.Y.Z. The old
// patterns matched only X.Y.Z: the field pattern required the closing quote right after
// the patch, so once "1.14.0-rc.1" was written every later bump threw "no
// frameworkVersion version field"; the prose pattern would have left the old suffix
// dangling ("v1.14.0-rc.2-rc.1"). These tests run the real sequence on temp copies of
// the three published surfaces, never on the tracked files.

const os = require('node:os');

function makeFixtureRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-sync-version-'));
  fs.mkdirSync(path.join(dir, '.github'));
  return dir;
}

function seedFixture(dir, version) {
  const config = fs.readFileSync(CONFIG_PATH, 'utf8').replace(FIELD_PATTERN, `$1${version}$2`);
  fs.writeFileSync(path.join(dir, 'qa-framework.config.json'), config, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    `# qa-framework\n\n> Current version: **v${version}**\n\nSince v1.7.0+ the plan template is primary.\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, '.github', 'copilot-instructions.md'),
    `This is the **source code** of \`@keber/qa-framework\` v${version} - a spec-driven framework.\n` +
      'Placeholder kept: v{{VERSION}}\n',
    'utf8'
  );
}

function readFixture(dir) {
  return {
    config: fs.readFileSync(path.join(dir, 'qa-framework.config.json'), 'utf8'),
    readme: fs.readFileSync(path.join(dir, 'README.md'), 'utf8'),
    copilot: fs.readFileSync(path.join(dir, '.github', 'copilot-instructions.md'), 'utf8'),
  };
}

test('sync-version: bumps through rc versions and promotion rewrite the whole version', () => {
  const dir = makeFixtureRoot();
  try {
    seedFixture(dir, '1.13.2');
    const sequence = ['1.14.0-rc.1', '1.14.0-rc.2', '1.14.0', '1.15.0-rc.1'];

    for (const version of sequence) {
      const changed = syncVersion({ rootDir: dir, version });
      assert.equal(changed.length, 3, `${version}: every surface must be rewritten`);

      const { config, readme, copilot } = readFixture(dir);
      assert.equal(JSON.parse(config).frameworkVersion, version, `${version}: config`);
      assert.ok(
        readme.includes(`> Current version: **v${version}**\n`),
        `${version}: README.md got\n${readme}`
      );
      assert.ok(
        copilot.includes(`\`@keber/qa-framework\` v${version} - a spec-driven`),
        `${version}: copilot-instructions.md got\n${copilot}`
      );
      // Only the first prose occurrence is the version marker; later ones are history.
      assert.ok(readme.includes('Since v1.7.0+ the plan template'), `${version}: README history`);
      assert.ok(copilot.includes('Placeholder kept: v{{VERSION}}'), `${version}: placeholder`);
      assert.doesNotMatch(readme + copilot + config, /-rc\.\d+-rc\./, `${version}: dangling suffix`);
    }

    // Promotion and the step after it are idempotent on a second run.
    assert.deepEqual(syncVersion({ rootDir: dir, version: '1.15.0-rc.1' }), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sync-version: a sentence-ending period is not consumed as a prerelease suffix', () => {
  const dir = makeFixtureRoot();
  try {
    seedFixture(dir, '1.13.2');
    fs.writeFileSync(path.join(dir, 'README.md'), 'Current release is v1.13.2.\nNext line.\n', 'utf8');
    syncVersion({ rootDir: dir, version: '1.14.0-rc.1' });
    assert.equal(
      fs.readFileSync(path.join(dir, 'README.md'), 'utf8'),
      'Current release is v1.14.0-rc.1.\nNext line.\n'
    );

    fs.writeFileSync(path.join(dir, 'README.md'), 'Current release is v1.14.0-rc.1.\n', 'utf8');
    syncVersion({ rootDir: dir, version: '1.14.0' });
    assert.equal(fs.readFileSync(path.join(dir, 'README.md'), 'utf8'), 'Current release is v1.14.0.\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sync-version: the version patterns follow the semver prerelease grammar', () => {
  const cases = [
    ['v1.14.0-rc.1', 'v1.14.0-rc.1'],
    ['v1.14.0-rc.1.', 'v1.14.0-rc.1'],
    ['v1.14.0-alpha.beta-2.10 next', 'v1.14.0-alpha.beta-2.10'],
    ['v1.13.2.', 'v1.13.2'],
    ['v1.13.2 - text', 'v1.13.2'],
    ['v1.13.2-', 'v1.13.2'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(input.match(PROSE_PATTERN)[0], expected, input);
  }

  assert.ok(FIELD_PATTERN.test('"frameworkVersion": "1.14.0-rc.1"'));
  assert.ok(FIELD_PATTERN.test('"frameworkVersion":"1.14.0"'));
  // A value that is not a version must still be refused rather than silently replaced.
  assert.ok(!FIELD_PATTERN.test('"frameworkVersion": "1.14.0-rc.1."'));
  assert.ok(!FIELD_PATTERN.test('"frameworkVersion": "latest"'));
});

test('sync-version: a config without a frameworkVersion version field fails loudly', () => {
  const dir = makeFixtureRoot();
  try {
    seedFixture(dir, '1.13.2');
    const configPath = path.join(dir, 'qa-framework.config.json');
    fs.writeFileSync(
      configPath,
      fs.readFileSync(configPath, 'utf8').replace(FIELD_PATTERN, '$1not-a-version$2'),
      'utf8'
    );
    assert.throws(
      () => syncVersion({ rootDir: dir, version: '1.14.0-rc.1' }),
      /no "frameworkVersion" version field/
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
