'use strict';

// The version stamped into the installed agent rules (v{{VERSION}} in
// .github/instructions/qa-framework.instructions.md and .claude/rules/qa-framework.md,
// v{VERSION} in qa/README.md) must be the version of the package doing the install.
//
// It used to be read from frameworkVersion in the consumer's config. That value is a
// copy: init writes it once into qa/qa-framework.config.json and nothing ever updates
// it, so after `npm update` + `upgrade` both rule files kept announcing the version
// the project was first scaffolded with. It also inherited any drift of the published
// qa-framework.config.json (1.10.0 while the package shipped 1.11.x and 1.12.0).
//
// Each test runs a temporary copy of the package whose package.json carries a fake
// version that appears nowhere else, so the only way to get it into the output is to
// read package.json.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const PKG_VERSION = '9.8.7-test.1';
const STALE = '1.10.0';

const INSTR = ['.github', 'instructions', 'qa-framework.instructions.md'];
const RULES = ['.claude', 'rules', 'qa-framework.md'];

/** Copy of the package with package.json at PKG_VERSION and a stale published config. */
function fakePackage() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-pkg-'));
  for (const entry of ['scripts', 'templates', 'skills', 'docs']) {
    fs.cpSync(path.join(REPO_ROOT, entry), path.join(dir, entry), { recursive: true });
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  pkg.version = PKG_VERSION;
  fs.writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'qa-framework.config.json'), 'utf8'));
  config.frameworkVersion = STALE;
  fs.writeFileSync(path.join(dir, 'qa-framework.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  return dir;
}

function run(pkgDir, script, cwd) {
  return spawnSync(process.execPath, [path.join(pkgDir, 'scripts', script)], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}

/** The "v<version>" announced on the first line naming the package. */
function announcedVersion(file) {
  const m = /`@keber\/qa-framework` v(\S+)/.exec(fs.readFileSync(file, 'utf8'));
  assert.ok(m, `no version line in ${file}`);
  return m[1];
}

function withDirs(fn) {
  const pkgDir = fakePackage();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-version-'));
  try {
    fn(pkgDir, cwd);
  } finally {
    fs.rmSync(pkgDir, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

function writeConsumerConfig(cwd, frameworkVersion) {
  const config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'qa-framework.config.json'), 'utf8'));
  config.frameworkVersion = frameworkVersion;
  const target = path.join(cwd, 'qa', 'qa-framework.config.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
  return target;
}

test('init without a config stamps the package version, not the published config value', () => {
  withDirs((pkgDir, cwd) => {
    const r = run(pkgDir, 'init.js', cwd);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(announcedVersion(path.join(cwd, ...INSTR)), PKG_VERSION);
    assert.equal(announcedVersion(path.join(cwd, ...RULES)), PKG_VERSION);
    assert.match(fs.readFileSync(path.join(cwd, 'qa', 'README.md'), 'utf8'), new RegExp(`v${PKG_VERSION.replace(/\./g, '\\.')}`));
  });
});

test('init with an existing config stamps the package version, not frameworkVersion', () => {
  withDirs((pkgDir, cwd) => {
    writeConsumerConfig(cwd, STALE);
    const r = run(pkgDir, 'init.js', cwd);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(announcedVersion(path.join(cwd, ...INSTR)), PKG_VERSION);
    assert.equal(announcedVersion(path.join(cwd, ...RULES)), PKG_VERSION);
  });
});

test('upgrade restamps both rule files with the new package version', () => {
  withDirs((pkgDir, cwd) => {
    // A project scaffolded by an older release: config and both files say STALE.
    const configPath = writeConsumerConfig(cwd, STALE);
    for (const rel of [INSTR, RULES]) {
      const file = path.join(cwd, ...rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `This project uses \`@keber/qa-framework\` v${STALE} for spec-driven automated testing.\n`);
    }
    const configBefore = fs.readFileSync(configPath);

    const r = run(pkgDir, 'upgrade.js', cwd);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(announcedVersion(path.join(cwd, ...INSTR)), PKG_VERSION);
    assert.equal(announcedVersion(path.join(cwd, ...RULES)), PKG_VERSION);
    // The consumer config is user-owned: upgrade reads it, never rewrites it.
    assert.deepEqual(fs.readFileSync(configPath), configBefore);
  });
});

test('init then upgrade to a newer package leaves both files on the newer version', () => {
  withDirs((pkgDir, cwd) => {
    // Install with the real package, then upgrade with the fake newer one.
    const init = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'init.js')], {
      cwd,
      env: { ...process.env, INIT_CWD: cwd },
      encoding: 'utf8',
    });
    assert.equal(init.status, 0, init.stderr);
    const installed = require(path.join(REPO_ROOT, 'package.json')).version;
    assert.equal(announcedVersion(path.join(cwd, ...INSTR)), installed);
    assert.equal(announcedVersion(path.join(cwd, ...RULES)), installed);

    const r = run(pkgDir, 'upgrade.js', cwd);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(announcedVersion(path.join(cwd, ...INSTR)), PKG_VERSION);
    assert.equal(announcedVersion(path.join(cwd, ...RULES)), PKG_VERSION);
  });
});
