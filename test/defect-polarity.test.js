'use strict';

// WP3.3 - defect-suite polarity helper (templates/automation-scaffold/fixtures/defects.ts).
//
// Two kinds of test live here:
//   - delivery and documentation checks, which run on every supported Node version;
//   - behaviour checks of the TypeScript helper itself. They load the template through
//     node:module stripTypeScriptTypes() (Node >= 22.13) with a fake `test` object in
//     place of @playwright/test, so no TypeScript or Playwright install is needed. On a
//     Node without stripTypeScriptTypes they are skipped, not failed.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const nodeModule = require('node:module');

const REPO_ROOT    = path.join(__dirname, '..');
const INIT_PATH    = path.join(REPO_ROOT, 'scripts', 'init.js');
const UPGRADE_PATH = path.join(REPO_ROOT, 'scripts', 'upgrade.js');
const TEMPLATE     = path.join(REPO_ROOT, 'templates', 'automation-scaffold', 'fixtures', 'defects.ts');
const FIXTURES_SRC = path.join(REPO_ROOT, 'templates', 'automation-scaffold', 'fixtures');
const LEGACY_SRC   = path.join(__dirname, 'fixtures', 'legacy-v1.11.3');
const SKILL_DIR    = path.join(REPO_ROOT, 'skills', 'qa-automation');

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}

const tmpProject = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-defects-'));
const e2e = (root) => path.join(root, 'qa', '07-automation', 'e2e');

function shippedScaffoldHashes() {
  const source = fs.readFileSync(UPGRADE_PATH, 'utf8');
  const match = source.match(/const SHIPPED_SCAFFOLD_HASHES = (\{[\s\S]*?\n\});/);
  assert.ok(match, 'SHIPPED_SCAFFOLD_HASHES not found in scripts/upgrade.js');
  return new Function(`return ${match[1]};`)();
}

function scaffoldHash(content) {
  return crypto
    .createHash('sha256')
    .update(content.replace(/^﻿/, '').replace(/\r\n/g, '\n'), 'utf8')
    .digest('hex');
}

/** A v1.11.3 project: init, then the legacy scaffold copied over it, no lane scripts. */
function makeLegacyProject() {
  const root = tmpProject();
  assert.equal(run(INIT_PATH, [], root).status, 0);
  for (const rel of ['playwright.config.ts', 'global-setup.ts', '.env.example',
    'fixtures/auth.ts', 'fixtures/base.ts', 'fixtures/test-helpers.ts']) {
    const dest = path.join(e2e(root), ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(LEGACY_SRC, ...rel.split('/')), dest);
  }
  fs.rmSync(path.join(e2e(root), 'scripts'), { recursive: true, force: true });
  fs.rmSync(path.join(e2e(root), 'fixtures', 'defects.ts'), { force: true });
  return root;
}

// --- delivery ------------------------------------------------------------------

test('init installs fixtures/defects.ts from the automation scaffold', () => {
  const root = tmpProject();
  try {
    assert.equal(run(INIT_PATH, [], root).status, 0);
    const dest = path.join(e2e(root), 'fixtures', 'defects.ts');
    assert.ok(fs.existsSync(dest), 'fixtures/defects.ts should have been created');
    assert.equal(fs.readFileSync(dest, 'utf8'), fs.readFileSync(TEMPLATE, 'utf8'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('invariant: every fixture of the automation scaffold is tracked by SHIPPED_SCAFFOLD_HASHES', () => {
  const table = shippedScaffoldHashes();
  for (const file of fs.readdirSync(FIXTURES_SRC)) {
    const key = `automation-scaffold/fixtures/${file}`;
    assert.ok(Array.isArray(table[key]), `${key} has no SHIPPED_SCAFFOLD_HASHES entry`);
    assert.ok(
      table[key].includes(scaffoldHash(fs.readFileSync(path.join(FIXTURES_SRC, file), 'utf8'))),
      `${key}: current hash is not registered`
    );
  }
});

test('upgrade delivers fixtures/defects.ts to a project that does not have it', () => {
  const root = makeLegacyProject();
  try {
    const result = run(UPGRADE_PATH, [], root);
    assert.equal(result.status, 0, result.stderr);
    const dest = path.join(e2e(root), 'fixtures', 'defects.ts');
    assert.ok(fs.existsSync(dest), 'fixtures/defects.ts should have been delivered');
    assert.equal(fs.readFileSync(dest, 'utf8'), fs.readFileSync(TEMPLATE, 'utf8'));
    assert.match(result.stdout, /e2e[\\/]fixtures[\\/]defects\.ts/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade keeps a user-edited fixtures/defects.ts byte-for-byte and says so', () => {
  const root = makeLegacyProject();
  try {
    const dest = path.join(e2e(root), 'fixtures', 'defects.ts');
    const mine = '// project-owned defect helper\nexport const openDefect = () => undefined;\n';
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, mine, 'utf8');
    const result = run(UPGRADE_PATH, [], root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(dest, 'utf8'), mine);
    assert.match(result.stdout, /e2e\/fixtures\/defects\.ts is user-owned/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- the template itself --------------------------------------------------------

test('template: imports nothing but @playwright/test and exports the documented API', () => {
  const src = fs.readFileSync(TEMPLATE, 'utf8');
  const imports = [...src.matchAll(/^import\s.*?from\s+'([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['@playwright/test']);
  for (const name of ['openDefect', 'expectOpenDefect', 'InfraError', 'isInfraError', 'defectsDiagEnabled']) {
    assert.match(src, new RegExp(`export (async )?(function|class) ${name}\\b`), `missing export ${name}`);
  }
  assert.match(src, /DEFECTS_DIAG/);
  assert.equal(src.charCodeAt(0) === 0xfeff, false, 'no BOM in a .ts file');
});

// --- behaviour (Node >= 22.13) ----------------------------------------------------

const canStrip = typeof nodeModule.stripTypeScriptTypes === 'function';
const behaviour = canStrip ? test : test.skip;

let loaded;
const state = { info: null, failCalls: [] };

async function helper() {
  if (loaded) return loaded;
  const ts = fs.readFileSync(TEMPLATE, 'utf8');
  const importLine = "import { test } from '@playwright/test';";
  assert.ok(ts.includes(importLine), 'template must import test from @playwright/test');
  // Strip mode keeps value imports as written, so the line can be swapped for the fake.
  const js = nodeModule
    .stripTypeScriptTypes(ts)
    .replace(importLine, 'const { test } = globalThis.__qaDefectsFake;');
  assert.ok(!js.includes('@playwright/test'), 'the fake must replace the only Playwright import');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-defects-ts-'));
  const file = path.join(dir, 'defects.mjs');
  fs.writeFileSync(file, js, 'utf8');
  globalThis.__qaDefectsFake = {
    test: {
      info: () => state.info,
      fail: (condition, description) => {
        state.failCalls.push({ condition, description });
        if (condition) state.info.expectedStatus = 'failed';
      },
    },
  };
  loaded = await import(pathToFileURL(file).href);
  return loaded;
}

function fresh(env) {
  state.info = { annotations: [], errors: [], expectedStatus: 'passed' };
  state.failCalls = [];
  if (env === 'diag') process.env.DEFECTS_DIAG = '1';
  else delete process.env.DEFECTS_DIAG;
  return state.info;
}

const annotationTypes = (info) => info.annotations.map((a) => a.type);

behaviour('openDefect marks the test as an expected failure and records the defect', async () => {
  const { openDefect } = await helper();
  const info = fresh();
  openDefect('4711', 'total ignores the discount');
  assert.equal(info.expectedStatus, 'failed');
  assert.deepEqual(annotationTypes(info), ['open-defect']);
  assert.match(info.annotations[0].description, /4711.*total ignores the discount/);
  assert.match(state.failCalls[0].description, /4711/);
});

behaviour('openDefect with DEFECTS_DIAG=1 does not mark the test, so its real result shows', async () => {
  const { openDefect } = await helper();
  const info = fresh('diag');
  try {
    openDefect(4711, 'total ignores the discount');
    assert.equal(info.expectedStatus, 'passed');
    assert.equal(state.failCalls.filter((c) => c.condition).length, 0);
    assert.deepEqual(annotationTypes(info), ['open-defect', 'defects-diag']);
  } finally {
    delete process.env.DEFECTS_DIAG;
  }
});

behaviour('openDefect rejects an empty id or reason', async () => {
  const { openDefect } = await helper();
  fresh();
  assert.throws(() => openDefect('', 'reason'), /id/);
  assert.throws(() => openDefect('  ', 'reason'), /id/);
  assert.throws(() => openDefect('12', ''), /reason/);
  assert.equal(state.info.expectedStatus, 'passed');
});

behaviour('openDefect refuses to mark a test that already has a soft failure', async () => {
  const { openDefect } = await helper();
  const info = fresh();
  info.errors.push({ message: 'precondition failed earlier' });
  assert.throws(() => openDefect('12', 'reason'), /before openDefect/);
  assert.equal(info.expectedStatus, 'passed', 'an earlier failure must not turn green');
});

behaviour('expectOpenDefect: a failing assertion is the expected failure', async () => {
  const { expectOpenDefect } = await helper();
  const info = fresh();
  const boom = new Error('expected 90, received 100');
  await assert.rejects(expectOpenDefect('12', 'discount', () => { throw boom; }), (e) => e === boom);
  assert.equal(info.expectedStatus, 'failed');
});

behaviour('expectOpenDefect: an InfraError is never swallowed as the expected failure', async () => {
  const { expectOpenDefect, InfraError } = await helper();
  const info = fresh();
  await assert.rejects(
    expectOpenDefect('12', 'discount', async () => { throw new InfraError('timeout', 'grid never loaded'); }),
    (e) => e instanceof InfraError
  );
  assert.equal(info.expectedStatus, 'passed', 'infrastructure failures must turn the run red');
});

behaviour('expectOpenDefect: passing assertions fail loudly and ask to close the defect', async () => {
  const { expectOpenDefect } = await helper();
  const info = fresh();
  await assert.rejects(expectOpenDefect('12', 'discount', () => {}), /12.*no longer reproduces/s);
  assert.equal(info.expectedStatus, 'passed');
});

behaviour('expectOpenDefect: a new soft failure counts as the defect reproducing', async () => {
  const { expectOpenDefect } = await helper();
  const info = fresh();
  await expectOpenDefect('12', 'discount', () => { info.errors.push({ message: 'soft' }); });
  assert.equal(info.expectedStatus, 'failed');
});

behaviour('expectOpenDefect with DEFECTS_DIAG=1 reports the raw result either way', async () => {
  const { expectOpenDefect } = await helper();
  try {
    let info = fresh('diag');
    const boom = new Error('real assertion');
    await assert.rejects(expectOpenDefect('12', 'discount', () => { throw boom; }), (e) => e === boom);
    assert.equal(info.expectedStatus, 'passed');
    info = fresh('diag');
    await expectOpenDefect('12', 'discount', () => {});
    assert.equal(info.expectedStatus, 'passed');
  } finally {
    delete process.env.DEFECTS_DIAG;
  }
});

behaviour('InfraError carries its kind and is recognised by isInfraError', async () => {
  const { InfraError, isInfraError } = await helper();
  const cause = new Error('socket hang up');
  const err = new InfraError('app-unavailable', 'GET /health returned 503', { cause });
  assert.ok(err instanceof Error);
  assert.equal(err.name, 'InfraError');
  assert.equal(err.kind, 'app-unavailable');
  assert.equal(err.cause, cause);
  assert.match(err.message, /app-unavailable.*503/);
  assert.equal(isInfraError(err), true);
  assert.equal(isInfraError(new Error('x')), false);
  // A second copy of the module (another import path) still recognises it by name.
  const foreign = Object.assign(new Error('x'), { name: 'InfraError', kind: 'timeout' });
  assert.equal(isInfraError(foreign), true);
});

behaviour('defectsDiagEnabled is true only for DEFECTS_DIAG=1', async () => {
  const { defectsDiagEnabled } = await helper();
  assert.equal(defectsDiagEnabled({ DEFECTS_DIAG: '1' }), true);
  assert.equal(defectsDiagEnabled({ DEFECTS_DIAG: '0' }), false);
  assert.equal(defectsDiagEnabled({ DEFECTS_DIAG: 'true' }), false);
  assert.equal(defectsDiagEnabled({}), false);
});

// --- documentation -------------------------------------------------------------------

test('qa-automation links the defect polarity reference and the API skill', () => {
  const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
  assert.match(skill, /references\/defect-polarity\.md/);
  assert.ok(fs.existsSync(path.join(SKILL_DIR, 'references', 'defect-polarity.md')));
  assert.match(skill, /\.\.\/qa-api-integration\/SKILL\.md/);
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'skills', 'qa-api-integration', 'SKILL.md')));
  const ref = fs.readFileSync(path.join(SKILL_DIR, 'references', 'defect-polarity.md'), 'utf8');
  for (const term of ['openDefect', 'expectOpenDefect', 'InfraError', 'DEFECTS_DIAG=1']) {
    assert.ok(ref.includes(term), `defect-polarity.md must explain ${term}`);
  }
});

test('folder-structure guide lists the write-safety and API conventions standards', () => {
  const guide = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'folder-structure-guide.md'), 'utf8');
  const section = guide.slice(guide.indexOf('## 00-standards/'), guide.indexOf('## 01-specifications/'));
  assert.match(section, /\| `write-safety-policy\.md` \|/);
  assert.match(section, /\| `api-testing-conventions\.md` \|/);
});
