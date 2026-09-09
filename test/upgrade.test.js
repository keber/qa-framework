'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const REPO_ROOT    = path.join(__dirname, '..');
const INIT_PATH    = path.join(REPO_ROOT, 'scripts', 'init.js');
const UPGRADE_PATH = path.join(REPO_ROOT, 'scripts', 'upgrade.js');

const AUTOMATION_SRC  = path.join(REPO_ROOT, 'templates', 'automation-scaffold');
const INTEGRATION_SRC = path.join(REPO_ROOT, 'templates', 'integration-scaffold');

const LANE_SCRIPTS = ['lane-config.js', 'lane-lock.js', 'global-setup-guards.js'];

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}

const runInit    = (cwd, args = []) => run(INIT_PATH, args, cwd);
const runUpgrade = (cwd, args = []) => run(UPGRADE_PATH, args, cwd);

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-upgrade-'));
}

const e2e = (root) => path.join(root, 'qa', '07-automation', 'e2e');
const integration = (root) => path.join(root, 'qa', '07-automation', 'integration');

/** Snapshot every file under a directory as relpath -> sha256. */
function snapshot(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        out[path.relative(dir, full)] = crypto
          .createHash('sha256')
          .update(fs.readFileSync(full))
          .digest('hex');
      }
    }
  })(dir);
  return out;
}

/**
 * Build a project that looks like a v1.11.3 installation: init it with the current
 * templates, then overwrite the scaffold files with the versions git shipped at
 * v1.11.3 and delete everything v1.12.0 introduced.
 */
function makeLegacyProject() {
  const root = tmpProject();
  const init = runInit(root);
  assert.equal(init.status, 0, init.stderr);

  for (const rel of [
    'playwright.config.ts',
    'global-setup.ts',
    '.env.example',
    'fixtures/auth.ts',
    'fixtures/base.ts',
    'fixtures/test-helpers.ts',
  ]) {
    const shipped = spawnSync(
      'git',
      ['show', `v1.11.3:templates/automation-scaffold/${rel}`],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );
    assert.equal(shipped.status, 0, `git show failed for ${rel}: ${shipped.stderr}`);
    const dest = path.join(e2e(root), ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, shipped.stdout, 'utf8');
  }

  // v1.12.0 introduced the lane scripts; a v1.11.3 project has none.
  fs.rmSync(path.join(e2e(root), 'scripts'), { recursive: true, force: true });
  return root;
}

test('upgrade: a pristine v1.11.3 project receives the whole v1.12.0 lane group', () => {
  const root = makeLegacyProject();
  try {
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    for (const file of LANE_SCRIPTS) {
      const dest = path.join(e2e(root), 'scripts', file);
      assert.ok(fs.existsSync(dest), `${file} should have been installed`);
      assert.equal(
        fs.readFileSync(dest, 'utf8'),
        fs.readFileSync(path.join(AUTOMATION_SRC, 'scripts', file), 'utf8')
      );
    }
    for (const file of ['playwright.config.ts', 'global-setup.ts']) {
      assert.equal(
        fs.readFileSync(path.join(e2e(root), file), 'utf8'),
        fs.readFileSync(path.join(AUTOMATION_SRC, file), 'utf8'),
        `${file} should have been updated to the v1.12.0 template`
      );
    }
    // The config is only usable if its require() target really landed.
    assert.match(
      fs.readFileSync(path.join(e2e(root), 'playwright.config.ts'), 'utf8'),
      /require\('\.\/scripts\/lane-lock\.js'\)/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: pristine fixtures and .env.example are refreshed to v1.12.0', () => {
  const root = makeLegacyProject();
  try {
    assert.equal(runUpgrade(root).status, 0);
    for (const file of ['auth.ts', 'base.ts', 'test-helpers.ts']) {
      assert.equal(
        fs.readFileSync(path.join(e2e(root), 'fixtures', file), 'utf8'),
        fs.readFileSync(path.join(AUTOMATION_SRC, 'fixtures', file), 'utf8'),
        `fixtures/${file} should have been refreshed`
      );
    }
    assert.equal(
      fs.readFileSync(path.join(e2e(root), '.env.example'), 'utf8'),
      fs.readFileSync(path.join(AUTOMATION_SRC, '.env.example'), 'utf8')
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: a customised fixture is kept and warned about, not clobbered', () => {
  const root = makeLegacyProject();
  try {
    // Replicate the QA_PortalProductores shape: a diverged base.ts using PASSWORD_SEL.
    const custom = [
      "import { test as base } from '@playwright/test';",
      "const PASSWORD_SEL = '#pwd';",
      'export async function login(page, password) {',
      '  await page.locator(PASSWORD_SEL).fill(password);',
      '}',
      '// project-specific helper the framework must never remove',
    ].join('\n');
    const target = path.join(e2e(root), 'fixtures', 'base.ts');
    fs.writeFileSync(target, custom, 'utf8');

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    assert.equal(fs.readFileSync(target, 'utf8'), custom, 'customised base.ts must survive');
    assert.match(result.stdout, /fixtures\/base\.ts is user-owned/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: the lane group is all-or-nothing when one member is user-owned', () => {
  const root = makeLegacyProject();
  try {
    const configPath = path.join(e2e(root), 'playwright.config.ts');
    // No testDir/testIgnore here, so the older v1.6.0 patcher has nothing to touch
    // and this test isolates the v1.12.0 group decision.
    const custom = '// hand-tuned by the team\nexport default { fullyParallel: true };\n';
    fs.writeFileSync(configPath, custom, 'utf8');

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    // The user's config survives...
    assert.equal(fs.readFileSync(configPath, 'utf8'), custom);
    // ...and because it did, none of the scripts it would need were installed either.
    for (const file of LANE_SCRIPTS) {
      assert.ok(
        !fs.existsSync(path.join(e2e(root), 'scripts', file)),
        `${file} must NOT be installed when the group is skipped`
      );
    }
    assert.equal(
      fs
        .readFileSync(path.join(e2e(root), 'global-setup.ts'), 'utf8')
        .includes('./scripts/lane-lock.js'),
      false,
      'global-setup.ts must not be upgraded to require scripts that were not installed'
    );
    assert.match(result.stdout, /Lane-aware automation scaffold \(v1\.12\.0\) NOT installed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: a hand-written lane-lock.js also blocks the whole group', () => {
  const root = makeLegacyProject();
  try {
    // QA_Nexus / QA_Sispro shape: their own lane-lock.js, no lane-config.js.
    const scriptsDir = path.join(e2e(root), 'scripts');
    fs.mkdirSync(scriptsDir, { recursive: true });
    const mine = 'module.exports = { acquire() { /* our own implementation */ } };\n';
    fs.writeFileSync(path.join(scriptsDir, 'lane-lock.js'), mine, 'utf8');

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    assert.equal(fs.readFileSync(path.join(scriptsDir, 'lane-lock.js'), 'utf8'), mine);
    assert.ok(!fs.existsSync(path.join(scriptsDir, 'lane-config.js')));
    assert.match(result.stdout, /NOT installed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: --dry-run reports the migration but writes nothing', () => {
  const root = makeLegacyProject();
  try {
    const before = snapshot(path.join(root, 'qa'));
    const result = runUpgrade(root, ['--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(snapshot(path.join(root, 'qa')), before, 'dry-run must not change any file');
    assert.ok(!fs.existsSync(path.join(e2e(root), 'scripts', 'lane-lock.js')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: a project without qa/07-automation/e2e/ is skipped cleanly', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    fs.rmSync(path.join(root, 'qa', '07-automation'), { recursive: true, force: true });

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    // The v1.12.0 migration must install none of the lane scaffold and must not warn
    // about it. (Earlier sections still recreate some empty e2e/ subfolders; that is
    // pre-existing v1.6.0 behaviour and deliberately not asserted here.)
    for (const file of LANE_SCRIPTS) {
      assert.ok(!fs.existsSync(path.join(e2e(root), 'scripts', file)), `${file} must not appear`);
    }
    assert.ok(!fs.existsSync(path.join(e2e(root), 'playwright.config.ts')));
    assert.ok(!fs.existsSync(path.join(e2e(root), 'fixtures', 'base.ts')));
    assert.doesNotMatch(result.stdout, /NOT installed/);
    assert.doesNotMatch(result.stdout, /Trace safety/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: trace-safety warns on .fill(password) with file and line', () => {
  const root = makeLegacyProject();
  try {
    const target = path.join(e2e(root), 'fixtures', 'base.ts');
    fs.writeFileSync(
      target,
      [
        '// custom login',
        'export async function login(page, password) {',
        '  await page.locator(PASSWORD_SEL).fill(password);',
        '}',
      ].join('\n'),
      'utf8'
    );

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Trace safety/);
    assert.match(result.stdout, /Pattern 7/);
    assert.match(result.stdout, /fixtures[\\/]base\.ts:3/, 'must report the exact line');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: trace-safety does not fire on the safe page.evaluate() pattern', () => {
  const root = makeLegacyProject();
  try {
    const target = path.join(e2e(root), 'fixtures', 'base.ts');
    fs.writeFileSync(
      target,
      [
        'export async function login(page, password) {',
        '  await page.evaluate(([sel, pwd]) => {',
        '    (document.querySelector(sel)).value = pwd;',
        '  }, [PASSWORD_SEL, password]);',
        '}',
      ].join('\n'),
      'utf8'
    );

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /Trace safety/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: a user-owned integration config is kept, a pristine one is refreshed', () => {
  const root = makeLegacyProject();
  try {
    const custom = '// our integration config\nexport default {};\n';
    fs.writeFileSync(path.join(integration(root), 'playwright.config.ts'), custom, 'utf8');

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    assert.equal(
      fs.readFileSync(path.join(integration(root), 'playwright.config.ts'), 'utf8'),
      custom
    );
    assert.match(result.stdout, /integration\/playwright\.config\.ts is user-owned/);
    // global-setup.ts was left pristine, so it still gets the new version.
    assert.equal(
      fs.readFileSync(path.join(integration(root), 'global-setup.ts'), 'utf8'),
      fs.readFileSync(path.join(INTEGRATION_SRC, 'global-setup.ts'), 'utf8')
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: a file already identical to the current template is not called user-owned', () => {
  // init.js writes the CURRENT templates, so a freshly initialised project must not be
  // reported as user-owned just because that hash is not in the historical table.
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /is user-owned/);
    assert.doesNotMatch(result.stdout, /NOT installed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: is idempotent - a second run changes nothing further', () => {
  const root = makeLegacyProject();
  try {
    assert.equal(runUpgrade(root).status, 0);
    const after1 = snapshot(path.join(root, 'qa'));
    assert.equal(runUpgrade(root).status, 0);
    assert.deepEqual(snapshot(path.join(root, 'qa')), after1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
