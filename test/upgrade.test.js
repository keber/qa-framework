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

// Byte-for-byte copies of the automation scaffold as it shipped in v1.11.3, committed
// as static fixtures. They used to be recovered with `git show v1.11.3:...`, which made
// the suite depend on repository history: it broke under the shallow clone that
// actions/checkout performs (no tags fetched), inside an `npm pack` tarball (no .git)
// and in any exported copy of the tree. Nothing here needs git any more.
const LEGACY_SRC = path.join(__dirname, 'fixtures', 'legacy-v1.11.3');

const LEGACY_SCAFFOLD_FILES = [
  'playwright.config.ts',
  'global-setup.ts',
  '.env.example',
  'fixtures/auth.ts',
  'fixtures/base.ts',
  'fixtures/test-helpers.ts',
];

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

/** Normalised content hash - must mirror scaffoldHash() in scripts/upgrade.js. */
function scaffoldHash(content) {
  return crypto
    .createHash('sha256')
    .update(content.replace(/^﻿/, '').replace(/\r\n/g, '\n'), 'utf8')
    .digest('hex');
}

/** The SHIPPED_SCAFFOLD_HASHES table as scripts/upgrade.js declares it. */
function shippedScaffoldHashes() {
  const source = fs.readFileSync(UPGRADE_PATH, 'utf8');
  const match = source.match(/const SHIPPED_SCAFFOLD_HASHES = (\{[\s\S]*?\n\});/);
  assert.ok(match, 'SHIPPED_SCAFFOLD_HASHES not found in scripts/upgrade.js');
  // The literal holds only strings and arrays; parsing it keeps the fixture guard
  // honest without exporting production internals purely for the tests.
  return new Function(`return ${match[1]};`)();
}

/**
 * Build a project that looks like a v1.11.3 installation: init it with the current
 * templates, then overwrite the scaffold files with the versions shipped at v1.11.3
 * (from test/fixtures/legacy-v1.11.3/) and delete everything v1.12.0 introduced.
 */
function makeLegacyProject() {
  const root = tmpProject();
  const init = runInit(root);
  assert.equal(init.status, 0, init.stderr);

  for (const rel of LEGACY_SCAFFOLD_FILES) {
    const src = path.join(LEGACY_SRC, ...rel.split('/'));
    assert.ok(fs.existsSync(src), `missing legacy fixture: ${src}`);
    const dest = path.join(e2e(root), ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }

  // v1.12.0 introduced the lane scripts; a v1.11.3 project has none.
  fs.rmSync(path.join(e2e(root), 'scripts'), { recursive: true, force: true });
  return root;
}

test('fixtures: every legacy v1.11.3 file is pristine-but-outdated for upgrade.js', () => {
  // Guards what makeLegacyProject() silently assumes. Without this, a fixture that
  // drifted out of SHIPPED_SCAFFOLD_HASHES would turn every "pristine file is
  // refreshed" test into a vacuous "user-owned file is kept" test.
  const table = shippedScaffoldHashes();
  for (const rel of LEGACY_SCAFFOLD_FILES) {
    const key = `automation-scaffold/${rel}`;
    const legacy = scaffoldHash(fs.readFileSync(path.join(LEGACY_SRC, ...rel.split('/')), 'utf8'));
    const current = scaffoldHash(
      fs.readFileSync(path.join(AUTOMATION_SRC, ...rel.split('/')), 'utf8')
    );
    assert.ok(
      Array.isArray(table[key]) && table[key].includes(legacy),
      `${key}: fixture hash ${legacy} is not in SHIPPED_SCAFFOLD_HASHES, so upgrade.js ` +
        'would treat it as user-owned and the refresh tests would prove nothing'
    );
    assert.notEqual(
      legacy,
      current,
      `${key}: fixture is identical to the current template, so "refreshed to v1.12.0" ` +
        'would pass without the upgrade doing anything'
    );
  }
});

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

// --- In-place refresh of an installed lane scaffold (v1.12.0+) ----------------------
//
// The lane group is atomic for its INSTALLATION (v1.11 -> v1.12), where a subset leaves
// Playwright unable to start. Once the three scripts exist, refreshing a pristine one
// changes no require() path; the remaining coupling is the module API, which the
// export invariant below pins. So a user-owned playwright.config.ts no longer freezes
// the framework's own scripts forever.

const V1120_SRC = path.join(__dirname, 'fixtures', 'scaffold-v1.12.0');

/** A project as v1.12.0 installed it, with the team's own playwright.config.ts. */
function makeV1120Project({ customConfig = true } = {}) {
  const root = tmpProject();
  assert.equal(runInit(root).status, 0);
  fs.copyFileSync(
    path.join(V1120_SRC, 'scripts', 'lane-lock.js'),
    path.join(e2e(root), 'scripts', 'lane-lock.js')
  );
  const configPath = path.join(e2e(root), 'playwright.config.ts');
  const custom =
    fs.readFileSync(configPath, 'utf8') + '\n// hand-tuned by the team: extra reporter\n';
  if (customConfig) fs.writeFileSync(configPath, custom, 'utf8');
  return { root, configPath, custom };
}

test('fixtures: the v1.12.0 lane-lock.js is shipped content, and older than the template', () => {
  const v1120 = scaffoldHash(fs.readFileSync(path.join(V1120_SRC, 'scripts', 'lane-lock.js'), 'utf8'));
  const current = scaffoldHash(fs.readFileSync(path.join(AUTOMATION_SRC, 'scripts', 'lane-lock.js'), 'utf8'));
  assert.ok(shippedScaffoldHashes()['automation-scaffold/scripts/lane-lock.js'].includes(v1120));
  assert.notEqual(v1120, current, 'the refresh tests would pass without upgrade doing anything');
});

test('upgrade: a pristine v1.12.0 lane-lock.js is refreshed even when playwright.config.ts is user-owned', () => {
  const { root, configPath, custom } = makeV1120Project();
  try {
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    for (const file of LANE_SCRIPTS) {
      assert.equal(
        fs.readFileSync(path.join(e2e(root), 'scripts', file), 'utf8'),
        fs.readFileSync(path.join(AUTOMATION_SRC, 'scripts', file), 'utf8'),
        `${file} should match the current template`
      );
    }
    assert.match(fs.readFileSync(path.join(e2e(root), 'scripts', 'lane-lock.js'), 'utf8'), /request_id/);
    assert.equal(fs.readFileSync(configPath, 'utf8'), custom, 'the user config must survive');
    assert.doesNotMatch(result.stdout, /NOT installed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: a user-modified lane-lock.js in an installed scaffold is kept and warned about', () => {
  // QA_Sispro_Exportadora shape: its own lane-lock.js next to the other scripts.
  const { root } = makeV1120Project();
  try {
    const lockPath = path.join(e2e(root), 'scripts', 'lane-lock.js');
    const mine = fs.readFileSync(lockPath, 'utf8') + '\n// our own sweep tweak\n';
    fs.writeFileSync(lockPath, mine, 'utf8');
    const before = snapshot(path.join(e2e(root), 'scripts'));

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(lockPath, 'utf8'), mine);
    // The scripts require() each other, so they refresh together or not at all.
    assert.deepEqual(snapshot(path.join(e2e(root), 'scripts')), before);
    assert.match(result.stdout, /Lane scripts NOT refreshed - user-owned:[\s\S]*e2e\/scripts\/lane-lock\.js/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: an installed scaffold with a pristine config refreshes the whole group', () => {
  const { root, configPath } = makeV1120Project({ customConfig: false });
  try {
    assert.equal(runUpgrade(root).status, 0);
    assert.equal(
      fs.readFileSync(path.join(e2e(root), 'scripts', 'lane-lock.js'), 'utf8'),
      fs.readFileSync(path.join(AUTOMATION_SRC, 'scripts', 'lane-lock.js'), 'utf8')
    );
    assert.equal(
      fs.readFileSync(configPath, 'utf8'),
      fs.readFileSync(path.join(AUTOMATION_SRC, 'playwright.config.ts'), 'utf8')
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- Invariants that keep the table from going stale again ---------------------------

test('invariant: the current hash of every scaffold file is in SHIPPED_SCAFFOLD_HASHES', () => {
  // Changing a scaffold file fails here until its new hash is registered, so every
  // released version is in the table before it ships. Without this, the first change
  // to a file turns every existing pristine copy of it into "user-owned" - which is
  // exactly how lane-lock.js stopped being deliverable after v1.13.2.
  const table = shippedScaffoldHashes();
  for (const key of Object.keys(table)) {
    const current = scaffoldHash(fs.readFileSync(path.join(REPO_ROOT, 'templates', ...key.split('/')), 'utf8'));
    assert.ok(
      table[key].includes(current),
      `${key}: current hash ${current} is not in SHIPPED_SCAFFOLD_HASHES (scripts/upgrade.js). ` +
        'Append it - never replace the older hashes, projects still carry them.'
    );
  }
});

test('invariant: every lane script in the scaffold is tracked by SHIPPED_SCAFFOLD_HASHES', () => {
  const table = shippedScaffoldHashes();
  for (const file of fs.readdirSync(path.join(AUTOMATION_SRC, 'scripts'))) {
    assert.ok(
      Array.isArray(table[`automation-scaffold/scripts/${file}`]),
      `automation-scaffold/scripts/${file} has no SHIPPED_SCAFFOLD_HASHES entry`
    );
  }
});

test('invariant: lane scripts never drop an export that a released version had', () => {
  // A user-owned playwright.config.ts / global-setup.ts keeps require()-ing whatever
  // the version it was written against exported; the in-place refresh relies on this.
  const recorded = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures', 'scaffold-script-exports.json'), 'utf8')
  );
  const cwd = tmpProject();
  try {
    for (const file of LANE_SCRIPTS) {
      const r = spawnSync(
        process.execPath,
        ['-e', `console.log(JSON.stringify(Object.keys(require(process.argv[1]))))`, path.join(AUTOMATION_SRC, 'scripts', file)],
        { cwd, encoding: 'utf8' }
      );
      assert.equal(r.status, 0, r.stderr);
      const current = JSON.parse(r.stdout.trim().split('\n').pop());
      for (const name of recorded[file]) {
        assert.ok(current.includes(name), `${file} dropped the released export "${name}"`);
      }
      for (const name of current) {
        assert.ok(
          recorded[file].includes(name),
          `${file} exports "${name}", which is not in test/fixtures/scaffold-script-exports.json - append it`
        );
      }
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
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

test('progress: [created] for new files, [updated] only for changed ones', () => {
  const root = makeLegacyProject();
  try {
    const first = runUpgrade(root);
    assert.equal(first.status, 0, first.stderr);
    // The lane scripts did not exist in a v1.11.3 project; the config did and changed.
    assert.match(first.stdout, /\[created\]\s+e2e\/scripts\/lane-config\.js/);
    assert.doesNotMatch(first.stdout, /\[updated\]\s+e2e\/scripts\/lane-config\.js/);
    assert.match(first.stdout, /\[updated\]\s+e2e\/playwright\.config\.ts/);

    const second = runUpgrade(root);
    assert.equal(second.status, 0, second.stderr);
    assert.doesNotMatch(second.stdout, /\[(updated|created)\]/, second.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('progress: upgrading a freshly initialized project prints no [updated] line', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /\[updated\]/, result.stdout);
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

// ---------------------------------------------------------------------------
// .claude/agents/ - sprint-cycle subagents (v1.13.0)
// ---------------------------------------------------------------------------

const SPRINT_AGENTS = [
  'qa-analisis',
  'qa-plan',
  'qa-asesoria',
  'qa-informe-resultados',
  'qa-reporte-ejecucion',
  'qa-investigador',
];

const agentFile = (root, name) => path.join(root, '.claude', 'agents', `${name}.md`);

test('upgrade: an existing project without the v1.13.0 keys gets all six agents with defaults', () => {
  const root = tmpProject();
  try {
    fs.writeFileSync(path.join(root, 'qa-framework.config.json'), JSON.stringify({
      project: { name: 'demo' },
      integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
    }));
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const name of SPRINT_AGENTS) {
      assert.ok(fs.existsSync(agentFile(root, name)), `expected .claude/agents/${name}.md`);
      assert.doesNotMatch(fs.readFileSync(agentFile(root, name), 'utf8'), /\{\{/);
    }
    const informe = fs.readFileSync(agentFile(root, 'qa-informe-resultados'), 'utf8');
    assert.match(informe, /0\.85/);
    const investigador = fs.readFileSync(agentFile(root, 'qa-investigador'), 'utf8');
    assert.match(investigador, /^tools: Read, Write, Edit, Grep, Glob, Bash$/m);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- ownership marker (rc.6) -------------------------------------------------

const MARKER_RE = /\r?\n<!-- qa-framework:generated sha256=([0-9a-f]{64}) -->\r?\n?$/;
const backupDir = (root) => path.join(root, '.claude', 'qa-framework-backup', 'agents');

function sprintProject() {
  const root = tmpProject();
  fs.writeFileSync(path.join(root, 'qa-framework.config.json'), JSON.stringify({
    project: { name: 'demo' },
    integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
  }));
  return root;
}

/** Body without the marker, hashed the way the marker is computed (BOM and CRLF agnostic). */
function bodyHash(text) {
  return scaffoldHash(text.replace(MARKER_RE, ''));
}

test('agents: every generated agent ends with a marker holding the hash of its own body', () => {
  const root = sprintProject();
  try {
    assert.equal(runUpgrade(root).status, 0);
    for (const name of SPRINT_AGENTS) {
      const text = fs.readFileSync(agentFile(root, name), 'utf8');
      const match = text.match(MARKER_RE);
      assert.ok(match, `${name}: no marker`);
      assert.equal(match[1], bodyHash(text), `${name}: marker hash does not match the body`);
      assert.match(text, /^---\r?\nname: /, `${name}: frontmatter must stay at the top`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agents: a second upgrade changes zero bytes under .claude/', () => {
  const root = sprintProject();
  try {
    assert.equal(runUpgrade(root).status, 0);
    const before = snapshot(path.join(root, '.claude'));
    const second = runUpgrade(root);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(snapshot(path.join(root, '.claude')), before);
    assert.equal(fs.existsSync(backupDir(root)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agents: a pristine but outdated agent (marker matches) is overwritten without backup', () => {
  const root = sprintProject();
  try {
    assert.equal(runUpgrade(root).status, 0);
    const current = fs.readFileSync(agentFile(root, 'qa-plan'), 'utf8');
    const oldBody = '---\nname: qa-plan\ndescription: old\n---\n\nOld generated body.\n';
    fs.writeFileSync(agentFile(root, 'qa-plan'),
      `${oldBody}\n<!-- qa-framework:generated sha256=${scaffoldHash(oldBody)} -->\n`);
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(agentFile(root, 'qa-plan'), 'utf8'), current);
    assert.equal(fs.existsSync(backupDir(root)), false);
    assert.doesNotMatch(result.stdout, /qa-plan\.md.*(edited|backup)/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agents: an edited agent (marker no longer matches) is kept and warned with its template', () => {
  const root = sprintProject();
  try {
    assert.equal(runUpgrade(root).status, 0);
    const file = agentFile(root, 'qa-plan');
    const edited = fs.readFileSync(file, 'utf8').replace(/^(---\r?\nname: qa-plan\r?\n)/, '$1# my note\n');
    fs.writeFileSync(file, edited);
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(file, 'utf8'), edited);
    assert.match(result.stdout, /\.claude[\\/]agents[\\/]qa-plan\.md/);
    assert.match(result.stdout, /templates\/agents\/qa-plan\.md/);
    assert.equal(fs.existsSync(backupDir(root)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agents: a legacy agent without marker is backed up once, then regenerated', () => {
  const root = sprintProject();
  try {
    const legacy = '---\nname: qa-plan\ndescription: hand-tuned\n---\n\nMy own instructions.\n';
    fs.mkdirSync(path.dirname(agentFile(root, 'qa-plan')), { recursive: true });
    fs.writeFileSync(agentFile(root, 'qa-plan'), legacy);

    const first = runUpgrade(root);
    assert.equal(first.status, 0, first.stderr);
    const backups = fs.readdirSync(backupDir(root));
    assert.equal(backups.length, 1, backups.join(', '));
    assert.match(backups[0], /^qa-plan\.\d{8}-\d{6}\.md$/);
    assert.equal(fs.readFileSync(path.join(backupDir(root), backups[0]), 'utf8'), legacy);
    assert.match(fs.readFileSync(agentFile(root, 'qa-plan'), 'utf8'), MARKER_RE);
    assert.match(first.stdout, /qa-framework-backup[\\/]agents[\\/]qa-plan\.\d{8}-\d{6}\.md/);
    // The other agents did not exist, so nothing else was backed up.
    assert.ok(!fs.existsSync(path.join(root, '.claude', 'agents', '.backup')));

    const before = snapshot(path.join(root, '.claude'));
    const second = runUpgrade(root);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(snapshot(path.join(root, '.claude')), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agents: a legacy agent identical to the current render is stamped without backup', () => {
  const root = sprintProject();
  try {
    assert.equal(runUpgrade(root).status, 0);
    const stamped = fs.readFileSync(agentFile(root, 'qa-plan'), 'utf8');
    fs.writeFileSync(agentFile(root, 'qa-plan'), stamped.replace(MARKER_RE, ''));
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(agentFile(root, 'qa-plan'), 'utf8'), stamped);
    assert.equal(fs.existsSync(backupDir(root)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agents: init stamps the marker, so the next upgrade neither warns nor backs up', () => {
  const root = sprintProject();
  try {
    assert.equal(runInit(root).status, 0);
    for (const name of SPRINT_AGENTS) {
      const text = fs.readFileSync(agentFile(root, name), 'utf8');
      assert.equal(text.match(MARKER_RE)?.[1], bodyHash(text), `${name}: init must stamp a valid marker`);
    }
    const before = snapshot(path.join(root, '.claude'));
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /ownership marker|edited after it was generated/);
    assert.deepEqual(snapshot(path.join(root, '.claude')), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agents: --dry-run neither backs up nor rewrites a legacy agent', () => {
  const root = sprintProject();
  try {
    const legacy = '---\nname: qa-plan\ndescription: hand-tuned\n---\n\nMy own instructions.\n';
    fs.mkdirSync(path.dirname(agentFile(root, 'qa-plan')), { recursive: true });
    fs.writeFileSync(agentFile(root, 'qa-plan'), legacy);
    const result = runUpgrade(root, ['--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(agentFile(root, 'qa-plan'), 'utf8'), legacy);
    assert.equal(fs.existsSync(backupDir(root)), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: bare MCP server names (1.12 config shape) generate qa-investigador and exit 0', () => {
  const root = tmpProject();
  try {
    fs.writeFileSync(path.join(root, 'qa-framework.config.json'), JSON.stringify({
      project: { name: 'demo' },
      parallelLanes: {
        enabled: true,
        lanes: [
          { id: '1', account: 'QA_USER', storageState: '.auth/a.json', mcpNamespace: 'playwright-gmo-lane1' },
          { id: '2', account: 'QA_USER2', storageState: '.auth/b.json', mcpNamespace: 'playwright-gmo-lane2' },
        ],
      },
      integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
    }));
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const investigador = fs.readFileSync(agentFile(root, 'qa-investigador'), 'utf8');
    assert.match(investigador, /mcp__playwright-gmo-lane1__browser_navigate/);
    assert.match(investigador, /mcp__playwright-gmo-lane2__browser_navigate/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: an invalid mcpNamespace fails qa-investigador only and exits 1', () => {
  const root = tmpProject();
  try {
    fs.writeFileSync(path.join(root, 'qa-framework.config.json'), JSON.stringify({
      project: { name: 'demo' },
      parallelLanes: {
        enabled: true,
        lanes: [{ id: '1', account: 'QA_USER', storageState: '.auth/a.json', mcpNamespace: 'mcp__bad' }],
      },
      integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
    }));
    const result = runUpgrade(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /qa-investigador/);
    assert.equal(fs.existsSync(agentFile(root, 'qa-investigador')), false);
    for (const name of SPRINT_AGENTS.filter((n) => n !== 'qa-investigador')) {
      assert.ok(fs.existsSync(agentFile(root, name)), `expected .claude/agents/${name}.md`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Legacy layout migrations (v1.6.0 e2e/{module}/ and v1.7.0 flat 02-test-plans/*.md)
// must only move content that is provably legacy. Anything else is user-owned.
// ---------------------------------------------------------------------------

const testPlans = (root) => path.join(root, 'qa', '02-test-plans');

function write(file, content = '// content\n') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

test('upgrade: non-module folders under e2e/ are never moved into tests/', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    const kept = [
      path.join('lib', 'foo.js'),
      path.join('node_modules', 'x', 'index.js'),
      // A dependency that ships its own specs must still not be treated as a module.
      path.join('node_modules', 'y', 'thing.spec.ts'),
      path.join('.auth', 'user.json'),
      path.join('test-results', 'run', 'login.spec.ts-trace.zip'),
      path.join('playwright-report', 'index.html'),
      path.join('.cache', 'stale.spec.ts'),
      // A user folder with no spec files is not proven legacy.
      path.join('docs', 'notes.md'),
    ];
    for (const rel of kept) write(path.join(e2e(root), rel));

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    for (const rel of kept) {
      assert.ok(fs.existsSync(path.join(e2e(root), rel)), `e2e/${rel} must stay where it is`);
      assert.ok(
        !fs.existsSync(path.join(e2e(root), 'tests', rel)),
        `e2e/${rel} must not be copied into tests/`
      );
    }
    assert.doesNotMatch(result.stdout, /\[migrated\] e2e\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/**
 * Turn a freshly initialised project into the pre-v1.6.0 layout: playwright.config.ts,
 * global-setup.ts, package.json and .env.example live directly in qa/07-automation/
 * with testDir '.', and specs sit in e2e/{module}/ (what init.js generated up to v1.5.x).
 */
function makeV15Layout(root) {
  const automation = path.join(root, 'qa', '07-automation');
  for (const file of ['playwright.config.ts', 'global-setup.ts', 'package.json', '.env.example']) {
    fs.renameSync(path.join(e2e(root), file), path.join(automation, file));
  }
  const cfg = path.join(automation, 'playwright.config.ts');
  fs.writeFileSync(
    cfg,
    fs.readFileSync(cfg, 'utf8').replace(/testDir\s*:\s*'\.\/tests'/, "testDir:  '.'"),
    'utf8'
  );
}

/** Point e2e/playwright.config.ts at testDir '.' - the pre-v1.6.0 value, mid-migration. */
function setLegacyTestDir(root) {
  const cfg = path.join(e2e(root), 'playwright.config.ts');
  fs.writeFileSync(
    cfg,
    fs.readFileSync(cfg, 'utf8').replace(/testDir\s*:\s*'\.\/tests'/, "testDir:  '.'"),
    'utf8'
  );
}

test('upgrade: a legacy e2e/{module}/ folder holding specs is still moved into tests/', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    setLegacyTestDir(root);
    write(path.join(e2e(root), 'login', 'login.spec.ts'));
    write(path.join(e2e(root), 'billing', 'invoices', 'list.spec.ts'));

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    assert.ok(fs.existsSync(path.join(e2e(root), 'tests', 'login', 'login.spec.ts')));
    assert.ok(fs.existsSync(path.join(e2e(root), 'tests', 'billing', 'invoices', 'list.spec.ts')));
    assert.ok(!fs.existsSync(path.join(e2e(root), 'login')));
    assert.ok(!fs.existsSync(path.join(e2e(root), 'billing')));
    assert.match(result.stdout, /\[migrated\] e2e\/login\/ -> e2e\/tests\/login\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: flat 02-test-plans/*.md that are not legacy plans stay in place', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    const kept = ['plan-sprint-1.md', 'README.md', 'notes.md'];
    for (const name of kept) write(path.join(testPlans(root), name), '# My plan\n');

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    for (const name of kept) {
      assert.ok(fs.existsSync(path.join(testPlans(root), name)), `${name} must stay in place`);
      assert.ok(!fs.existsSync(path.join(testPlans(root), 'sprints', 'legacy', name)));
    }
    assert.doesNotMatch(result.stdout, /\[migrated\] 02-test-plans\/[^/\s]+\.md/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: legacy flat test plans are still moved to sprints/legacy/', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    // Naming used by qa-test-plan up to v1.6.x.
    write(path.join(testPlans(root), 'login-test-plan.md'), '# Test Plan - Login\n');
    write(path.join(testPlans(root), 'billing-automated-test-plan.md'), '# Test Plan\n');
    // Renamed by hand, but still generated from the pre-v1.7.0 templates/test-plan.md.
    write(
      path.join(testPlans(root), 'pagos.md'),
      '# Test Plan - Pagos\n\n**Plan ID**: TP-PAG-1.0\n**Module**: Pagos\n'
    );

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    for (const name of ['login-test-plan.md', 'billing-automated-test-plan.md', 'pagos.md']) {
      assert.ok(
        fs.existsSync(path.join(testPlans(root), 'sprints', 'legacy', name)),
        `${name} should have been moved to sprints/legacy/`
      );
      assert.ok(!fs.existsSync(path.join(testPlans(root), name)));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: --dry-run reports legacy module and plan moves but moves nothing', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    makeV15Layout(root);
    write(path.join(e2e(root), 'login', 'login.spec.ts'));
    write(path.join(testPlans(root), 'login-test-plan.md'), '# Test Plan\n');
    const before = snapshot(path.join(root, 'qa'));

    const result = runUpgrade(root, ['--dry-run']);
    assert.equal(result.status, 0, result.stderr);

    assert.match(result.stdout, /\[migrated\] e2e\/login\//);
    assert.match(result.stdout, /\[migrated\] 02-test-plans\/login-test-plan\.md/);
    assert.deepEqual(snapshot(path.join(root, 'qa')), before, 'dry-run must not move any file');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// A1 regression (field report against v1.12.0, qa/memory/framework-known-issues.md
// in a consumer project): upgrade relocated user folders it did not recognise.
// Every shape below is taken from a real consumer installation.
// ---------------------------------------------------------------------------

test('upgrade A1: field-report shapes (lib/, node_modules/, flat plans) are left byte-identical', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    // Page-object library (lib/core + lib/screens), and a lib/ that holds its own
    // specs because a Playwright project points testDir at './lib/fixtures/cli'.
    write(path.join(e2e(root), 'lib', 'core', 'base-page.ts'));
    write(path.join(e2e(root), 'lib', 'screens', 'login.screen.ts'));
    write(path.join(e2e(root), 'lib', 'db', 'read-only-guard.ts'));
    write(path.join(e2e(root), 'lib', 'fixtures', 'cli', 'agr.spec.ts'));
    write(path.join(e2e(root), 'node_modules', '@playwright', 'test', 'index.js'));
    write(path.join(e2e(root), 'node_modules', 'some-dep', 'self.spec.js'));
    write(path.join(testPlans(root), 'Plan-de-Pruebas-Proyecto-DOT.md'), '# Plan de Pruebas\n');
    write(path.join(testPlans(root), 'README.md'), '# Planes\n');

    const before = {
      lib: snapshot(path.join(e2e(root), 'lib')),
      nodeModules: snapshot(path.join(e2e(root), 'node_modules')),
    };
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    assert.deepEqual(snapshot(path.join(e2e(root), 'lib')), before.lib, 'e2e/lib/ must not change');
    assert.deepEqual(
      snapshot(path.join(e2e(root), 'node_modules')),
      before.nodeModules,
      'e2e/node_modules/ must not change'
    );
    assert.ok(!fs.existsSync(path.join(e2e(root), 'tests', 'lib')));
    assert.ok(!fs.existsSync(path.join(e2e(root), 'tests', 'node_modules')));
    for (const name of ['Plan-de-Pruebas-Proyecto-DOT.md', 'README.md']) {
      assert.ok(fs.existsSync(path.join(testPlans(root), name)), `${name} must stay in place`);
    }
    assert.ok(!fs.existsSync(path.join(testPlans(root), 'sprints', 'legacy')));
    assert.doesNotMatch(result.stdout, /\[migrated\]/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade A1: unknown spec folders in a post-v1.6.0 project (testDir ./tests) are not moved', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    // Specs deliberately kept outside testDir: scratch probes, parked suites.
    write(path.join(e2e(root), 'temp', 'probe.spec.ts'));
    write(path.join(e2e(root), 'archive', 'old-login.spec.ts'));

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    for (const rel of [path.join('temp', 'probe.spec.ts'), path.join('archive', 'old-login.spec.ts')]) {
      assert.ok(fs.existsSync(path.join(e2e(root), rel)), `e2e/${rel} must stay where it is`);
      assert.ok(!fs.existsSync(path.join(e2e(root), 'tests', rel)));
    }
    assert.doesNotMatch(result.stdout, /\[migrated\] e2e\//);
    // Left alone, but reported so the user can decide.
    assert.match(result.stdout, /e2e\/temp\//);
    assert.match(result.stdout, /e2e\/archive\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade A1: spec folders are not moved when no playwright.config.ts proves the layout', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    fs.rmSync(path.join(e2e(root), 'playwright.config.ts'));
    write(path.join(e2e(root), 'login', 'login.spec.ts'));

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    assert.ok(fs.existsSync(path.join(e2e(root), 'login', 'login.spec.ts')));
    assert.ok(!fs.existsSync(path.join(e2e(root), 'tests', 'login')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade A1: a real v1.5.x layout is still migrated end to end', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    makeV15Layout(root);
    write(path.join(e2e(root), 'login', 'login.spec.ts'));
    write(path.join(e2e(root), 'lib', 'helpers.ts'));

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    for (const file of ['playwright.config.ts', 'global-setup.ts', 'package.json', '.env.example']) {
      assert.ok(fs.existsSync(path.join(e2e(root), file)), `${file} should be in e2e/`);
    }
    assert.ok(fs.existsSync(path.join(e2e(root), 'tests', 'login', 'login.spec.ts')));
    assert.ok(fs.existsSync(path.join(e2e(root), 'lib', 'helpers.ts')), 'lib/ is never a module');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade A1: 07-automation/ root files are not moved into e2e/ without a legacy root config', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    // A workspace-level package.json next to e2e/ and integration/, plus a shared
    // fixtures/ folder: user-owned, not leftovers of the v1.5.x layout.
    const automation = path.join(root, 'qa', '07-automation');
    fs.rmSync(path.join(e2e(root), 'package.json'));
    write(path.join(automation, 'package.json'), '{ "private": true, "workspaces": ["e2e", "integration"] }\n');
    fs.rmSync(path.join(e2e(root), 'fixtures'), { recursive: true, force: true });
    write(path.join(automation, 'fixtures', 'shared-data.ts'));

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    assert.ok(fs.existsSync(path.join(automation, 'package.json')), '07-automation/package.json must stay');
    assert.ok(!fs.existsSync(path.join(e2e(root), 'package.json')));
    assert.ok(
      fs.existsSync(path.join(automation, 'fixtures', 'shared-data.ts')),
      '07-automation/fixtures/ must stay'
    );
    assert.ok(!fs.existsSync(path.join(e2e(root), 'fixtures', 'shared-data.ts')));
    assert.doesNotMatch(result.stdout, /\[migrated\] qa/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade A1: 02-test-plans/{automated,manual}/ move only when they hold pre-v1.7.0 plans', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    // Legacy: what qa-test-plan <= v1.6.x wrote ({module}-test-plan.md).
    write(path.join(testPlans(root), 'automated', 'pp-bprole-test-plan.md'), '# Test Plan\n');
    // User-created after v1.7.0: nothing in it proves it is a legacy folder.
    write(path.join(testPlans(root), 'manual', 'checklist-regresion.md'), '# Checklist\n');

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    assert.ok(
      fs.existsSync(path.join(testPlans(root), 'sprints', 'legacy-automated', 'pp-bprole-test-plan.md'))
    );
    assert.ok(fs.existsSync(path.join(testPlans(root), 'manual', 'checklist-regresion.md')), 'manual/ must stay');
    assert.ok(!fs.existsSync(path.join(testPlans(root), 'sprints', 'legacy-manual')));
    assert.match(result.stdout, /02-test-plans\/manual\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- Report honesty (WP1.7) ------------------------------------------------------------
//
// "Skipped (already up to date)" must mean exactly one thing: the consumer's file is
// identical (normalised) to the template this release ships. A user-owned file that
// differs was left untouched and is MISSING the framework's change; listing it as up to
// date tells the user there is nothing to do, which is false. Those files must be
// reported as a warning that names the template to merge from.

/** The paths listed under one "--- Results ---" heading, as forward-slash relpaths. */
function reportSection(stdout, heading) {
  const lines = stdout.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^ {4}- (.+)$/);
    if (!match) break;
    out.push(match[1].trim().replace(/\\/g, '/'));
  }
  return out;
}

const upToDate = (stdout) => reportSection(stdout, 'Skipped (already up to date):');

/**
 * Every scaffold file listed as up to date must really equal its current template.
 * Non-scaffold paths (memory seeds and the like) are checked by their own tests.
 */
function assertUpToDateIsTrue(root, stdout) {
  const scaffolds = [
    ['qa/07-automation/e2e/', AUTOMATION_SRC],
    ['qa/07-automation/integration/', INTEGRATION_SRC],
  ];
  for (const rel of upToDate(stdout)) {
    for (const [prefix, src] of scaffolds) {
      if (!rel.startsWith(prefix)) continue;
      const template = path.join(src, ...rel.slice(prefix.length).split('/'));
      if (!fs.existsSync(template)) continue;
      const consumer = path.join(root, ...rel.split('/'));
      assert.ok(fs.existsSync(consumer), `${rel} is listed as up to date but does not exist`);
      assert.equal(
        scaffoldHash(fs.readFileSync(consumer, 'utf8')),
        scaffoldHash(fs.readFileSync(template, 'utf8')),
        `${rel} is listed as "already up to date" but differs from the current template`
      );
    }
  }
}

test('report: a user-owned playwright.config.ts next to pristine lane scripts is warned, not "up to date"', () => {
  const { root, configPath, custom } = makeV1120Project();
  try {
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(configPath, 'utf8'), custom, 'the user config must survive');

    assert.ok(
      !upToDate(result.stdout).includes('qa/07-automation/e2e/playwright.config.ts'),
      'a user-owned config that misses this release\'s change is not "already up to date"'
    );
    assert.match(
      result.stdout,
      /e2e\/playwright\.config\.ts is user-owned - left untouched[\s\S]*?node_modules\/@keber\/qa-framework\/templates\/automation-scaffold\/playwright\.config\.ts/
    );
    assertUpToDateIsTrue(root, result.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('report: files held back by a blocked lane group are not "up to date"', () => {
  const root = makeLegacyProject();
  try {
    const configPath = path.join(e2e(root), 'playwright.config.ts');
    fs.writeFileSync(configPath, '// hand-tuned by the team\nexport default { fullyParallel: true };\n', 'utf8');

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    const listed = upToDate(result.stdout);
    for (const rel of ['playwright.config.ts', 'global-setup.ts', ...LANE_SCRIPTS.map((f) => `scripts/${f}`)]) {
      assert.ok(!listed.includes(`qa/07-automation/e2e/${rel}`), `e2e/${rel} must not be "already up to date"`);
    }
    // The pristine-but-outdated global-setup.ts stays as it was and is named as held back.
    assert.match(result.stdout, /NOT installed[\s\S]*?Held back with them[\s\S]*?e2e\/global-setup\.ts/);
    assertUpToDateIsTrue(root, result.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('report: a user-owned fixture is warned with its template path, not "up to date"', () => {
  const root = makeLegacyProject();
  try {
    const target = path.join(e2e(root), 'fixtures', 'base.ts');
    fs.writeFileSync(target, '// our own base fixture\n', 'utf8');

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!upToDate(result.stdout).includes('qa/07-automation/e2e/fixtures/base.ts'));
    assert.match(
      result.stdout,
      /e2e\/fixtures\/base\.ts is user-owned - left untouched[\s\S]*?templates\/automation-scaffold\/fixtures\/base\.ts/
    );
    assertUpToDateIsTrue(root, result.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('report: a user-owned integration config is warned with its template path, not "up to date"', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    const target = path.join(integration(root), 'playwright.config.ts');
    fs.writeFileSync(target, '// our own integration config\n', 'utf8');

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!upToDate(result.stdout).includes('qa/07-automation/integration/playwright.config.ts'));
    assert.match(
      result.stdout,
      /integration\/playwright\.config\.ts is user-owned - left untouched[\s\S]*?templates\/integration-scaffold\/playwright\.config\.ts/
    );
    assertUpToDateIsTrue(root, result.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('report: an edited memory seed file is reported as kept, not "up to date"', () => {
  const root = tmpProject();
  try {
    assert.equal(runInit(root).status, 0);
    const memoryFile = path.join(root, 'qa', 'memory', 'ci-pipeline-findings.md');
    assert.ok(fs.existsSync(memoryFile), 'init seeds qa/memory/');
    const mine = '# CI findings\n\n- our own finding\n';
    fs.writeFileSync(memoryFile, mine, 'utf8');

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(memoryFile, 'utf8'), mine);
    assert.ok(!upToDate(result.stdout).includes('qa/memory/ci-pipeline-findings.md'));
    assert.ok(reportSection(result.stdout, 'Kept (your content, never overwritten):').includes('qa/memory/ci-pipeline-findings.md'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('report: a second run lists only files that really equal the current template', () => {
  const { root } = makeV1120Project({ customConfig: false });
  try {
    assert.equal(runUpgrade(root).status, 0);
    const second = runUpgrade(root);
    assert.equal(second.status, 0, second.stderr);
    assert.ok(upToDate(second.stdout).includes('qa/07-automation/e2e/playwright.config.ts'));
    assertUpToDateIsTrue(root, second.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
