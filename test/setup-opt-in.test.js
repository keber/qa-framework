'use strict';

// WP3.4 - login only in global setup (C5) and opt-in Playwright projects (C8), on the
// automation scaffold (templates/automation-scaffold/).
//
// Three kinds of test live here:
//   - the CommonJS pieces (global-setup-guards.js, run-opt-in.js), on every Node;
//   - behaviour of the TypeScript templates (playwright.config.ts, fixtures/auth.ts),
//     loaded through node:module stripTypeScriptTypes() (Node >= 22.13) with fakes in
//     place of @playwright/test and dotenv. Skipped, not failed, on an older Node;
//   - delivery through init and upgrade.
// Every file written here goes to a temporary directory, never to the repository.

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
const SCAFFOLD     = path.join(REPO_ROOT, 'templates', 'automation-scaffold');
const GUARDS_PATH  = path.join(SCAFFOLD, 'scripts', 'global-setup-guards.js');
const LAUNCHER     = path.join(SCAFFOLD, 'scripts', 'run-opt-in.js');
const LEGACY_SRC   = path.join(__dirname, 'fixtures', 'legacy-v1.11.3');
const SKILL_DIR    = path.join(REPO_ROOT, 'skills', 'qa-automation');

const OPT_IN = ['login-flow', 'writes', 'slow'];

const guards = require(GUARDS_PATH);

function run(script, args, cwd, env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd, ...env },
    encoding: 'utf8',
  });
}

const tmpDir = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `qa-framework-${tag}-`));
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

// --- opt-in selection (global-setup-guards.js) --------------------------------------

test('optInEnvVar derives QA_RUN_<NAME> from the project name', () => {
  assert.equal(guards.optInEnvVar('writes'), 'QA_RUN_WRITES');
  assert.equal(guards.optInEnvVar('login-flow'), 'QA_RUN_LOGIN_FLOW');
});

test('resolveOptInProjects selects nothing by default', () => {
  const env = {};
  assert.deepEqual(guards.resolveOptInProjects(OPT_IN, env, ['node', 'playwright', 'test']), []);
  assert.deepEqual(env, {}, 'nothing selected, nothing written back');
});

test('resolveOptInProjects selects a project whose variable is exactly 1', () => {
  assert.deepEqual(guards.resolveOptInProjects(OPT_IN, { QA_RUN_WRITES: '1' }, []), ['writes']);
  for (const value of ['true', 'yes', '0', '']) {
    assert.deepEqual(guards.resolveOptInProjects(OPT_IN, { QA_RUN_WRITES: value }, []), [], value);
  }
});

test('resolveOptInProjects selects from --project in both argv forms, case-insensitively', () => {
  assert.deepEqual(guards.resolveOptInProjects(OPT_IN, {}, ['test', '--project', 'slow']), ['slow']);
  assert.deepEqual(guards.resolveOptInProjects(OPT_IN, {}, ['test', '--project=Login-Flow']), ['login-flow']);
  assert.deepEqual(
    guards.resolveOptInProjects(OPT_IN, {}, ['test', '--project=slow', '--project', 'writes']),
    ['writes', 'slow'],
    'returned in table order',
  );
});

test('resolveOptInProjects ignores --project names that are not opt-in projects', () => {
  assert.deepEqual(guards.resolveOptInProjects(OPT_IN, {}, ['test', '--project=chromium']), []);
});

test('resolveOptInProjects writes the selection back to env so workers see it', () => {
  // Playwright workers re-load the config without the runner's --project arguments,
  // but they inherit its environment.
  const env = {};
  guards.resolveOptInProjects(OPT_IN, env, ['test', '--project', 'login-flow']);
  assert.equal(env.QA_RUN_LOGIN_FLOW, '1');
  assert.equal(env.QA_RUN_WRITES, undefined);
});

// --- run-opt-in.js launcher --------------------------------------------------------

/** A folder shaped like e2e/: the launcher in scripts/, a fake Playwright CLI that records its call. */
function launcherSandbox() {
  const root = tmpDir('optin-launcher');
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.copyFileSync(LAUNCHER, path.join(root, 'scripts', 'run-opt-in.js'));
  const pw = path.join(root, 'node_modules', '@playwright', 'test');
  fs.mkdirSync(pw, { recursive: true });
  fs.writeFileSync(path.join(pw, 'package.json'), '{"name":"@playwright/test","version":"0.0.0"}', 'utf8');
  fs.writeFileSync(
    path.join(pw, 'cli.js'),
    "require('fs').writeFileSync(require('path').join(process.cwd(), 'call.json'), JSON.stringify({\n" +
      '  argv: process.argv.slice(2),\n' +
      '  env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("QA_RUN_"))),\n' +
      '}));\n' +
      'process.exit(7);\n',
    'utf8',
  );
  return root;
}

test('run-opt-in.js starts Playwright on the named project without a shell', () => {
  const root = launcherSandbox();
  try {
    const r = run(path.join(root, 'scripts', 'run-opt-in.js'), ['writes', '-g', 'a & b | "c"'], root);
    assert.equal(r.status, 7, `exit status is Playwright's: ${r.stderr}`);
    const call = JSON.parse(fs.readFileSync(path.join(root, 'call.json'), 'utf8'));
    assert.deepEqual(call.argv, ['test', '--project', 'writes', '-g', 'a & b | "c"'],
      'arguments reach Playwright verbatim, no shell interpreted them');
    assert.deepEqual(call.env, { QA_RUN_WRITES: '1' });
    assert.match(r.stdout, /writes/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('run-opt-in.js --dry-run prints the command and starts nothing', () => {
  const root = launcherSandbox();
  try {
    const r = run(path.join(root, 'scripts', 'run-opt-in.js'), ['login-flow', '--dry-run'], root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /--project login-flow/);
    assert.match(r.stdout, /QA_RUN_LOGIN_FLOW=1/);
    assert.ok(!fs.existsSync(path.join(root, 'call.json')), 'Playwright must not have run');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('run-opt-in.js refuses a missing or malformed project name', () => {
  const root = launcherSandbox();
  try {
    for (const args of [[], ['--project'], ['Writes'], ['../x'], ['-g']]) {
      const r = run(path.join(root, 'scripts', 'run-opt-in.js'), args, root);
      assert.notEqual(r.status, 0, `should refuse ${JSON.stringify(args)}`);
      assert.match(r.stderr, /usage|project name/i);
    }
    assert.ok(!fs.existsSync(path.join(root, 'call.json')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('run-opt-in.js and the guards derive the same variable name', () => {
  const launcher = require(LAUNCHER);
  for (const name of OPT_IN) assert.equal(launcher.optInEnvVar(name), guards.optInEnvVar(name));
});

// --- playwright.config.ts behaviour (Node >= 22.13) --------------------------------

const canStrip = typeof nodeModule.stripTypeScriptTypes === 'function';
const behaviour = canStrip ? test : test.skip;

/**
 * Loads the config template as CommonJS inside an init-ed project, so its require()s
 * of ./scripts/*.js resolve to the real scaffold scripts.
 */
function loadConfig({ env = {}, argv = ['node', 'playwright', 'test'] } = {}) {
  const root = tmpDir('optin-config');
  assert.equal(run(INIT_PATH, [], root).status, 0);
  const dir = e2e(root);
  for (const f of fs.readdirSync(path.join(SCAFFOLD, 'scripts'))) {
    fs.copyFileSync(path.join(SCAFFOLD, 'scripts', f), path.join(dir, 'scripts', f));
  }
  const replacements = [
    ["import { defineConfig, devices } from '@playwright/test';", 'const { defineConfig, devices } = globalThis.__qaConfigFake;'],
    ["import * as dotenv from 'dotenv';", 'const dotenv = globalThis.__qaConfigFake.dotenv;'],
    ["import * as fs from 'fs';", "const fs = require('fs');"],
    ['export const ', 'const '],
    ['export default ', 'module.exports = '],
  ];
  let js = nodeModule.stripTypeScriptTypes(fs.readFileSync(path.join(SCAFFOLD, 'playwright.config.ts'), 'utf8'));
  for (const [from, to] of replacements) {
    assert.ok(js.includes(from), `config template no longer contains: ${from}`);
    js = js.split(from).join(to);
  }
  assert.ok(!/^\s*(import|export)\s/m.test(js), 'every import/export must have been rewritten');
  const file = path.join(dir, 'config-under-test.cjs');
  fs.writeFileSync(file, js, 'utf8');

  globalThis.__qaConfigFake = {
    defineConfig: (c) => c,
    devices: { 'Desktop Chrome': { browserName: 'chromium' } },
    dotenv: { parse: () => ({}) },
  };
  const touched = ['QA_BASE_URL', 'QA_LANE_ONLY', ...OPT_IN.map(guards.optInEnvVar)];
  const savedEnv = Object.fromEntries(touched.map((k) => [k, process.env[k]]));
  const savedArgv = process.argv;
  const savedCwd = process.cwd();
  try {
    for (const k of touched) delete process.env[k];
    Object.assign(process.env, { QA_BASE_URL: 'https://qa.example.test' }, env);
    process.argv = argv;
    process.chdir(dir);
    const config = require(file);
    const envAfter = Object.fromEntries(touched.map((k) => [k, process.env[k]]));
    return { config, envAfter };
  } finally {
    process.chdir(savedCwd);
    process.argv = savedArgv;
    for (const k of touched) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    delete require.cache[file];
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const names = (config) => config.projects.map((p) => p.name);
const OFF = { trace: 'off', video: 'off', screenshot: 'off' };

behaviour('config: by default no opt-in project is registered', () => {
  const { config } = loadConfig();
  for (const name of OPT_IN) assert.ok(!names(config).includes(name), `${name} must not be registered`);
  assert.ok(names(config).includes('setup'));
});

behaviour('config: lane projects ignore every opt-in test file', () => {
  const { config } = loadConfig({ env: { QA_RUN_WRITES: '1', QA_RUN_SLOW: '1', QA_RUN_LOGIN_FLOW: '1' } });
  const optIn = config.projects.filter((p) => OPT_IN.includes(p.name));
  assert.equal(optIn.length, 3);
  const lanes = config.projects.filter((p) => p.name !== 'setup' && !OPT_IN.includes(p.name));
  assert.ok(lanes.length >= 1);
  for (const lane of lanes) {
    for (const p of optIn) {
      assert.ok(lane.testIgnore.includes(p.testMatch), `${lane.name} must ignore ${p.testMatch}`);
    }
    for (const base of config.testIgnore) assert.ok(lane.testIgnore.includes(base), `${lane.name} keeps ${base}`);
  }
});

behaviour('config: an env-selected write project uses a lane session and the setup dependency', () => {
  const { config } = loadConfig({ env: { QA_RUN_WRITES: '1' } });
  const writes = config.projects.find((p) => p.name === 'writes');
  assert.ok(writes, 'writes registered by QA_RUN_WRITES=1');
  assert.equal(typeof writes.use.storageState, 'string');
  assert.deepEqual(writes.dependencies, ['setup']);
  assert.ok(!names(config).includes('slow'));
});

behaviour('config: --project registers the opt-in project and writes the variable back for workers', () => {
  const { config, envAfter } = loadConfig({ argv: ['node', 'playwright', 'test', '--project=login-flow'] });
  assert.ok(names(config).includes('login-flow'));
  assert.equal(envAfter.QA_RUN_LOGIN_FLOW, '1');
});

behaviour('config: the login-flow project captures no artifacts and holds no session', () => {
  const { config } = loadConfig({ env: { QA_RUN_LOGIN_FLOW: '1' } });
  const login = config.projects.find((p) => p.name === 'login-flow');
  for (const [k, v] of Object.entries(OFF)) assert.equal(login.use[k], v, `login-flow ${k}`);
  assert.equal(login.use.storageState, undefined);
  assert.equal(login.dependencies, undefined, 'a login-flow run does not need a lane session');
});

behaviour('config: the setup project captures no artifacts', () => {
  const { config } = loadConfig();
  const setup = config.projects.find((p) => p.name === 'setup');
  for (const [k, v] of Object.entries(OFF)) assert.equal(setup.use[k], v, `setup ${k}`);
});

// --- fixtures/auth.ts behaviour (Node >= 22.13) ------------------------------------

const authState = { info: null, infoThrows: false };
let authModule;

async function auth() {
  if (authModule) return authModule;
  const ts = fs.readFileSync(path.join(SCAFFOLD, 'fixtures', 'auth.ts'), 'utf8');
  const importLine = "import { test } from '@playwright/test';";
  assert.ok(ts.includes(importLine), 'auth.ts must import test from @playwright/test');
  const js = nodeModule.stripTypeScriptTypes(ts).replace(importLine, 'const { test } = globalThis.__qaAuthFake;');
  const code = js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!code.includes('@playwright/test'), 'the fake must replace the only Playwright value import');
  const dir = tmpDir('optin-auth');
  const file = path.join(dir, 'auth.mjs');
  fs.writeFileSync(file, js, 'utf8');
  globalThis.__qaAuthFake = {
    test: {
      info: () => {
        if (authState.infoThrows) throw new Error('test.info() can only be called while test is running');
        return authState.info;
      },
    },
  };
  authModule = await import(pathToFileURL(file).href);
  return authModule;
}

function fakePage() {
  const calls = [];
  const locator = (sel) => ({
    fill: async (v) => calls.push(['fill', sel, v]),
    waitFor: async () => calls.push(['waitFor', sel]),
    click: async () => calls.push(['click', sel]),
  });
  return {
    calls,
    goto: async (url) => calls.push(['goto', url]),
    locator,
    evaluate: async () => calls.push(['evaluate']),
    waitForSelector: async (sel) => calls.push(['waitForSelector', sel]),
  };
}

behaviour('auth: capturedArtifacts reports every capture that is not off', async () => {
  const { capturedArtifacts } = await auth();
  assert.deepEqual(capturedArtifacts(undefined), []);
  assert.deepEqual(capturedArtifacts(OFF), []);
  assert.deepEqual(
    capturedArtifacts({ trace: 'retain-on-failure', video: { mode: 'on' }, screenshot: 'only-on-failure' }),
    ['trace', 'video', 'screenshot'],
  );
  assert.deepEqual(capturedArtifacts({ trace: { mode: 'off' }, video: 'off', screenshot: 'on' }), ['screenshot']);
  assert.deepEqual(capturedArtifacts({ trace: true }), ['trace'], 'an unknown shape counts as captured');
});

behaviour('auth: loginAs refuses before touching the page when the project records artifacts', async () => {
  const { loginAs } = await auth();
  authState.infoThrows = false;
  authState.info = { project: { name: 'chromium', use: { trace: 'retain-on-failure', video: 'off', screenshot: 'off' } } };
  const page = fakePage();
  const saved = { e: process.env.QA_USER_EMAIL, p: process.env.QA_USER_PASSWORD };
  process.env.QA_USER_EMAIL = 'someone@example.test';
  process.env.QA_USER_PASSWORD = 'not-a-real-secret';
  try {
    await assert.rejects(loginAs(page, 'default'), (err) => {
      assert.match(err.message, /chromium/);
      assert.match(err.message, /trace/);
      assert.match(err.message, /login-flow/);
      assert.ok(!err.message.includes('not-a-real-secret'), 'never echo the credential');
      return true;
    });
    assert.deepEqual(page.calls, []);
  } finally {
    for (const [k, v] of [['QA_USER_EMAIL', saved.e], ['QA_USER_PASSWORD', saved.p]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

behaviour('auth: loginAs refuses outside a running test', async () => {
  const { loginAs } = await auth();
  authState.infoThrows = true;
  const page = fakePage();
  try {
    await assert.rejects(loginAs(page), /global-setup\.ts/);
    assert.deepEqual(page.calls, []);
  } finally {
    authState.infoThrows = false;
  }
});

behaviour('auth: loginAs runs in a project that captures nothing, without fill() on the password', async () => {
  const { loginAs } = await auth();
  authState.infoThrows = false;
  authState.info = { project: { name: 'login-flow', use: OFF } };
  const page = fakePage();
  const saved = { e: process.env.QA_USER_EMAIL, p: process.env.QA_USER_PASSWORD };
  process.env.QA_USER_EMAIL = 'someone@example.test';
  process.env.QA_USER_PASSWORD = 'not-a-real-secret';
  try {
    await loginAs(page, 'default');
    assert.equal(page.calls[0][0], 'goto');
    assert.ok(!page.calls.some((c) => c[0] === 'fill' && c[2] === 'not-a-real-secret'));
  } finally {
    for (const [k, v] of [['QA_USER_EMAIL', saved.e], ['QA_USER_PASSWORD', saved.p]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// --- global-setup.ts: the one place a login happens ---------------------------------

test('global-setup.ts never records the login it performs', () => {
  const src = fs.readFileSync(path.join(SCAFFOLD, 'global-setup.ts'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const forbidden of [/tracing\s*\.\s*start/, /recordVideo/, /recordHar/, /\.screenshot\s*\(/]) {
    assert.ok(!forbidden.test(code), `global-setup.ts must not use ${forbidden}`);
  }
});

// --- delivery -------------------------------------------------------------------------

test('init installs the launcher and the opt-in npm scripts', () => {
  const root = tmpDir('optin-init');
  try {
    assert.equal(run(INIT_PATH, [], root).status, 0);
    const dest = path.join(e2e(root), 'scripts', 'run-opt-in.js');
    assert.equal(fs.readFileSync(dest, 'utf8'), fs.readFileSync(LAUNCHER, 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(e2e(root), 'package.json'), 'utf8'));
    for (const name of OPT_IN) {
      assert.equal(pkg.scripts[`test:${name}`], `node scripts/run-opt-in.js ${name}`);
    }
    assert.equal(pkg.scripts.test, 'playwright test', '`npm test` stays the default suite only');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('SHIPPED_SCAFFOLD_HASHES tracks run-opt-in.js at its current hash', () => {
  const table = shippedScaffoldHashes();
  const known = table['automation-scaffold/scripts/run-opt-in.js'];
  assert.ok(Array.isArray(known));
  assert.ok(known.includes(scaffoldHash(fs.readFileSync(LAUNCHER, 'utf8'))));
});

/** A v1.11.3 project: init, then the legacy scaffold copied over it, no scripts/. */
function makeLegacyProject() {
  const root = tmpDir('optin-upgrade');
  assert.equal(run(INIT_PATH, [], root).status, 0);
  for (const rel of ['playwright.config.ts', 'global-setup.ts', '.env.example',
    'fixtures/auth.ts', 'fixtures/base.ts', 'fixtures/test-helpers.ts']) {
    const dest = path.join(e2e(root), ...rel.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(LEGACY_SRC, ...rel.split('/')), dest);
  }
  fs.rmSync(path.join(e2e(root), 'scripts'), { recursive: true, force: true });
  // The package.json of an older install has none of the opt-in scripts.
  const pkgPath = path.join(e2e(root), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  for (const name of OPT_IN) delete pkg.scripts[`test:${name}`];
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return root;
}

const upgrade = (root, args = []) => run(UPGRADE_PATH, args, root);

test('upgrade: a pristine project gets the launcher and is told which npm scripts to add', () => {
  const root = makeLegacyProject();
  try {
    const pkgBefore = fs.readFileSync(path.join(e2e(root), 'package.json'), 'utf8');
    const r = upgrade(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      fs.readFileSync(path.join(e2e(root), 'scripts', 'run-opt-in.js'), 'utf8'),
      fs.readFileSync(LAUNCHER, 'utf8'),
    );
    assert.equal(
      fs.readFileSync(path.join(e2e(root), 'playwright.config.ts'), 'utf8'),
      fs.readFileSync(path.join(SCAFFOLD, 'playwright.config.ts'), 'utf8'),
    );
    assert.equal(fs.readFileSync(path.join(e2e(root), 'package.json'), 'utf8'), pkgBefore,
      'upgrade never edits package.json');
    for (const name of OPT_IN) {
      assert.ok(r.stdout.includes(`"test:${name}": "node scripts/run-opt-in.js ${name}"`), `hint for test:${name}`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: no npm script hint when the config is user-owned (it declares no opt-in projects)', () => {
  const root = makeLegacyProject();
  try {
    fs.appendFileSync(path.join(e2e(root), 'playwright.config.ts'), '\n// local change\n');
    const r = upgrade(root);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!r.stdout.includes('node scripts/run-opt-in.js'), r.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: a user-owned run-opt-in.js is kept and warned about', () => {
  const root = makeLegacyProject();
  try {
    const dest = path.join(e2e(root), 'scripts', 'run-opt-in.js');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, '// my own launcher\n', 'utf8');
    const r = upgrade(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(dest, 'utf8'), '// my own launcher\n');
    assert.match(r.stdout, /e2e\/scripts\/run-opt-in\.js is user-owned/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: a test that logs in itself holds back a pristine auth.ts and is reported', () => {
  const root = makeLegacyProject();
  try {
    const spec = path.join(e2e(root), 'tests', 'orders', 'orders.spec.ts');
    fs.mkdirSync(path.dirname(spec), { recursive: true });
    fs.writeFileSync(spec,
      "import { test } from '@playwright/test';\n" +
      "import { loginAs } from '../../fixtures/auth';\n" +
      "test('x', async ({ page }) => {\n  await loginAs(page, 'admin');\n});\n", 'utf8');
    const authBefore = fs.readFileSync(path.join(e2e(root), 'fixtures', 'auth.ts'), 'utf8');
    const r = upgrade(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(path.join(e2e(root), 'fixtures', 'auth.ts'), 'utf8'), authBefore,
      'the old auth.ts stays, so the existing test keeps running');
    assert.match(r.stdout, /orders[\\/]orders\.spec\.ts:4/);
    assert.match(r.stdout, /fixtures\/auth\.ts NOT refreshed/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: without in-test logins a pristine auth.ts is refreshed', () => {
  const root = makeLegacyProject();
  try {
    const login = path.join(e2e(root), 'tests', 'auth', 'sign-in.login.spec.ts');
    fs.mkdirSync(path.dirname(login), { recursive: true });
    fs.writeFileSync(login, "await loginAs(page, 'default');\n", 'utf8');
    const r = upgrade(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      fs.readFileSync(path.join(e2e(root), 'fixtures', 'auth.ts'), 'utf8'),
      fs.readFileSync(path.join(SCAFFOLD, 'fixtures', 'auth.ts'), 'utf8'),
    );
    assert.ok(!/Login safety/.test(r.stdout), 'a *.login.spec.ts is the allowed place');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: in-test logins are reported even when auth.ts is user-owned', () => {
  const root = makeLegacyProject();
  try {
    fs.appendFileSync(path.join(e2e(root), 'fixtures', 'auth.ts'), '\n// edited\n');
    const spec = path.join(e2e(root), 'tests', 'a.spec.ts');
    fs.writeFileSync(spec, "\n\nawait loginAs(page);\n", 'utf8');
    const r = upgrade(root);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Login safety/);
    assert.match(r.stdout, /a\.spec\.ts:3/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- existing specs named with an opt-in suffix --------------------------------------
// The new config moves *.login/.writes/.slow.spec.ts out of the default suite. A project
// that already has such files must not lose them from `npm test` silently.

/** An installed scaffold (current lane scripts) whose config is a pristine older one. */
function makeInstalledProjectWithOldConfig() {
  const root = tmpDir('optin-installed');
  assert.equal(run(INIT_PATH, [], root).status, 0);
  fs.copyFileSync(path.join(LEGACY_SRC, 'playwright.config.ts'), path.join(e2e(root), 'playwright.config.ts'));
  return root;
}

function writeSpec(root, rel) {
  const dest = path.join(e2e(root), 'tests', ...rel.split('/'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, "import { test } from '@playwright/test';\n", 'utf8');
}

test('upgrade: existing opt-in-suffixed specs hold back a pristine config, with a warning', () => {
  const root = makeInstalledProjectWithOldConfig();
  try {
    writeSpec(root, 'report.slow.spec.ts');
    writeSpec(root, 'orders/orders.writes.spec.ts');
    const configPath = path.join(e2e(root), 'playwright.config.ts');
    const before = fs.readFileSync(configPath, 'utf8');
    const r = upgrade(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(configPath, 'utf8'), before, 'the config must not be refreshed');
    assert.match(r.stdout, /e2e\/playwright\.config\.ts NOT refreshed/);
    assert.match(r.stdout, /report\.slow\.spec\.ts/);
    assert.match(r.stdout, /orders[\\/]orders\.writes\.spec\.ts/);
    assert.match(r.stdout, /default suite/);
    assert.match(r.stdout, /write-safety-policy\.md/);
    assert.ok(!r.stdout.includes('node scripts/run-opt-in.js writes'), 'no npm script hint for a held-back config');
    // The rest of the delivery is unaffected.
    assert.equal(
      fs.readFileSync(path.join(e2e(root), 'scripts', 'global-setup-guards.js'), 'utf8'),
      fs.readFileSync(GUARDS_PATH, 'utf8'),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: an existing *.login.spec.ts also holds back the config', () => {
  const root = makeInstalledProjectWithOldConfig();
  try {
    writeSpec(root, 'auth/sign-in.login.spec.ts');
    const configPath = path.join(e2e(root), 'playwright.config.ts');
    const before = fs.readFileSync(configPath, 'utf8');
    const r = upgrade(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(configPath, 'utf8'), before);
    assert.match(r.stdout, /sign-in\.login\.spec\.ts/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: without opt-in-suffixed specs an installed project refreshes its pristine config', () => {
  const root = makeInstalledProjectWithOldConfig();
  try {
    writeSpec(root, 'orders/orders.spec.ts');
    const r = upgrade(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(
      fs.readFileSync(path.join(e2e(root), 'playwright.config.ts'), 'utf8'),
      fs.readFileSync(path.join(SCAFFOLD, 'playwright.config.ts'), 'utf8'),
    );
    assert.ok(!/NOT refreshed/.test(r.stdout), r.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: in a project without lane scripts, opt-in-suffixed specs keep the whole old setup', () => {
  // The config and global-setup.ts require() the scripts, so the first delivery is
  // all-or-nothing: holding the config back holds the group back.
  const root = makeLegacyProject();
  try {
    writeSpec(root, 'orders.writes.spec.ts');
    const configPath = path.join(e2e(root), 'playwright.config.ts');
    const before = fs.readFileSync(configPath, 'utf8');
    const r = upgrade(root);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(configPath, 'utf8'), before);
    assert.match(r.stdout, /orders\.writes\.spec\.ts/);
    assert.ok(!fs.existsSync(path.join(e2e(root), 'scripts', 'lane-lock.js')), 'group not installed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: a config already current is never held back by suffixed specs', () => {
  const root = tmpDir('optin-current');
  try {
    assert.equal(run(INIT_PATH, [], root).status, 0);
    writeSpec(root, 'report.slow.spec.ts');
    const r = upgrade(root);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!/playwright\.config\.ts NOT refreshed/.test(r.stdout), r.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- guidance --------------------------------------------------------------------------

test('qa-automation documents login-only-in-setup and opt-in projects', () => {
  const skill = fs.readFileSync(path.join(SKILL_DIR, 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('references/session-and-opt-in-projects.md'));
  const ref = fs.readFileSync(path.join(SKILL_DIR, 'references', 'session-and-opt-in-projects.md'), 'utf8');
  for (const needle of ['storageState', 'global-setup.ts', 'login-flow', 'QA_RUN_', 'run-opt-in.js',
    '*.login.spec.ts', '*.writes.spec.ts', '*.slow.spec.ts', 'trace']) {
    assert.ok(ref.includes(needle), `reference must mention ${needle}`);
  }
});
