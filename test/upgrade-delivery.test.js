'use strict';

// upgrade delivers to EXISTING projects what init gives new ones in 1.14.0:
// the qa/00-standards/ documents and the integration scaffold's API guard set.
// Every project here lives in a temporary directory; nothing reads git history or
// writes a tracked file.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

const REPO_ROOT = path.join(__dirname, '..');
const INIT_PATH = path.join(REPO_ROOT, 'scripts', 'init.js');
const UPGRADE_PATH = path.join(REPO_ROOT, 'scripts', 'upgrade.js');
const TEMPLATES = path.join(REPO_ROOT, 'templates');
const INTEGRATION_SRC = path.join(TEMPLATES, 'integration-scaffold');

const { STANDARDS_DOCS, standardsDocContent } = require('../scripts/lib/standards-docs');
const { INTEGRATION_GUARD_FILES } = require('../scripts/lib/integration-guard-files');

// The integration scaffold files as v1.13.2 shipped them (static copies, no git).
const V1132_SRC = path.join(__dirname, 'fixtures', 'integration-v1.13.2');
const V1132_FILES = ['playwright.config.ts', 'global-setup.ts', '.env.example', 'package.json', 'README.md', 'tests/example.spec.ts'];

const GUARD_RELS = INTEGRATION_GUARD_FILES.map((e) => e.rel);
const NEW_IN_114 = GUARD_RELS.filter((rel) => rel !== 'tests/example.spec.ts');

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}
const runInit = (cwd) => run(INIT_PATH, [], cwd);
const runUpgrade = (cwd, args = []) => run(UPGRADE_PATH, args, cwd);

const integration = (root) => path.join(root, 'qa', '07-automation', 'integration');
const standards = (root) => path.join(root, 'qa', '00-standards');
const at = (dir, rel) => path.join(dir, ...rel.split('/'));

function withProject(build, body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-delivery-'));
  try {
    build(root);
    body(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function freshInit(root) {
  const r = runInit(root);
  assert.equal(r.status, 0, r.stderr);
}

/** A project as v1.13.2 left it: no write-safety policy, no API guard, old scaffold. */
function v1132Project(root) {
  freshInit(root);
  fs.rmSync(path.join(standards(root), 'write-safety-policy.md'));
  const dir = integration(root);
  for (const rel of NEW_IN_114) fs.rmSync(at(dir, rel));
  for (const sub of ['scripts', 'fixtures', 'tests/security', 'tests/write']) {
    fs.rmSync(at(dir, sub), { recursive: true, force: true });
  }
  for (const rel of V1132_FILES) fs.copyFileSync(at(V1132_SRC, rel), at(dir, rel));
}

function scaffoldHash(content) {
  return crypto.createHash('sha256').update(content.replace(/^﻿/, '').replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}
const sameFile = (a, b) => scaffoldHash(fs.readFileSync(a, 'utf8')) === scaffoldHash(fs.readFileSync(b, 'utf8'));

function shippedScaffoldHashes() {
  const source = fs.readFileSync(UPGRADE_PATH, 'utf8');
  const match = source.match(/const SHIPPED_SCAFFOLD_HASHES = (\{[\s\S]*?\n\});/);
  assert.ok(match, 'SHIPPED_SCAFFOLD_HASHES not found in scripts/upgrade.js');
  return new Function(`return ${match[1]};`)();
}

/** relpath -> raw sha256 of every file under dir. */
function snapshot(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(dir, full).replace(/\\/g, '/')] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  })(dir);
  return out;
}

/** Relative imports and require()s of a .ts/.js source. */
function relativeImports(source) {
  const out = new Set();
  for (const re of [/\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/g, /\brequire\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g]) {
    for (const m of source.matchAll(re)) out.add(m[1]);
  }
  return [...out];
}

function resolveImport(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  return [base, `${base}.ts`, `${base}.js`, path.join(base, 'index.ts')].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
}

/** Every relative import of every .ts/.js under dir resolves to an existing file. */
function assertCoherent(dir) {
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|js)$/.test(entry.name)) {
        for (const spec of relativeImports(fs.readFileSync(full, 'utf8'))) {
          assert.ok(resolveImport(full, spec), `${path.relative(dir, full)} imports ${spec}, which does not exist`);
        }
      }
    }
  })(dir);
}

/** The paths listed under one "--- Results ---" heading, as forward-slash relpaths. */
function reportSection(stdout, heading) {
  const lines = stdout.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^ {4}(?:- |\S+ )(.+)$/);
    if (!match || line.trim() === '') break;
    out.push(match[1].trim().replace(/\\/g, '/'));
  }
  return out;
}
const updatedList = (stdout) => reportSection(stdout, 'Updated (framework-owned):');
const upToDate = (stdout) => reportSection(stdout, 'Skipped (already up to date):');
const keptList = (stdout) => reportSection(stdout, 'Kept (your content, never overwritten):');
const INT = 'qa/07-automation/integration/';

// --- the lists themselves ---------------------------------------------------------

test('lists: every standards entry names an existing template, and init installs exactly them', () => {
  for (const doc of STANDARDS_DOCS) {
    if (doc.template) assert.ok(fs.existsSync(path.join(TEMPLATES, doc.template)), `templates/${doc.template} missing`);
    else assert.equal(typeof doc.content, 'string', `${doc.file} has neither template nor content`);
  }
  withProject(freshInit, (root) => {
    const installed = fs.readdirSync(standards(root)).sort();
    assert.deepEqual(installed, STANDARDS_DOCS.map((d) => d.file).sort());
    for (const doc of STANDARDS_DOCS) {
      assert.equal(fs.readFileSync(path.join(standards(root), doc.file), 'utf8'), standardsDocContent(doc));
    }
  });
});

test('lists: the API guard list covers every scripts/fixtures/tests file of the integration scaffold', () => {
  const onDisk = [];
  (function walk(rel) {
    for (const entry of fs.readdirSync(at(INTEGRATION_SRC, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(child);
      else if (/^(scripts|fixtures|tests)\//.test(child)) onDisk.push(child);
    }
  })('');
  assert.deepEqual([...GUARD_RELS].sort(), onDisk.sort());
});

test('lists: each API guard entry declares exactly the scaffold files it imports, after them', () => {
  const seen = new Set();
  for (const entry of INTEGRATION_GUARD_FILES) {
    const file = at(INTEGRATION_SRC, entry.rel);
    const imports = relativeImports(fs.readFileSync(file, 'utf8')).map((spec) =>
      path.relative(INTEGRATION_SRC, resolveImport(file, spec)).replace(/\\/g, '/'));
    // playwright.config.ts is a behavioural dep (it keeps tests/write/ out of npm test).
    const declared = entry.deps.filter((d) => d !== 'playwright.config.ts');
    assert.deepEqual([...declared].sort(), [...new Set(imports)].sort(), `${entry.rel}: deps differ from its imports`);
    for (const dep of declared) assert.ok(seen.has(dep), `${entry.rel} is listed before its dep ${dep}`);
    assert.ok(['framework', 'user'].includes(entry.owner), `${entry.rel}: unknown owner`);
    seen.add(entry.rel);
  }
});

test('lists: every API guard file has SHIPPED_SCAFFOLD_HASHES, and the v1.13.2 fixture is shipped content', () => {
  const table = shippedScaffoldHashes();
  for (const rel of GUARD_RELS) {
    assert.ok(Array.isArray(table[`integration-scaffold/${rel}`]), `integration-scaffold/${rel} has no SHIPPED_SCAFFOLD_HASHES entry`);
  }
  for (const rel of ['playwright.config.ts', 'global-setup.ts', '.env.example', 'tests/example.spec.ts']) {
    const hash = scaffoldHash(fs.readFileSync(at(V1132_SRC, rel), 'utf8'));
    assert.ok(table[`integration-scaffold/${rel}`].includes(hash), `fixture ${rel} is not a shipped version`);
  }
  // The point of the example.spec.ts entry: the pre-1.14 copy is pristine but outdated.
  assert.ok(!sameFile(at(V1132_SRC, 'tests/example.spec.ts'), at(INTEGRATION_SRC, 'tests/example.spec.ts')));
});

test('invariant: integration guard scripts never drop an export that a released version had', () => {
  const recorded = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'integration-script-exports.json'), 'utf8'));
  for (const file of ['api-guard.js', 'hard-exclusions.js']) {
    const r = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify(Object.keys(require(process.argv[1]))))',
      path.join(INTEGRATION_SRC, 'scripts', file)], { encoding: 'utf8', cwd: os.tmpdir() });
    assert.equal(r.status, 0, r.stderr);
    const current = JSON.parse(r.stdout.trim().split('\n').pop());
    for (const name of recorded[file]) assert.ok(current.includes(name), `${file} dropped the released export "${name}"`);
    for (const name of current) {
      assert.ok(recorded[file].includes(name), `${file} exports "${name}", not in test/fixtures/integration-script-exports.json - append it`);
    }
  }
});

// --- scenario 1: a pristine v1.13.2 project --------------------------------------

test('delivery: a pristine v1.13.2 project receives the policy and the whole API guard, coherent', () => {
  withProject(v1132Project, (root) => {
    const dir = integration(root);
    const pkgBefore = fs.readFileSync(path.join(dir, 'package.json'));
    const readmeBefore = fs.readFileSync(path.join(dir, 'README.md'));

    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    const policy = path.join(standards(root), 'write-safety-policy.md');
    assert.ok(sameFile(policy, path.join(TEMPLATES, 'write-safety-policy.md')), 'policy installed');
    for (const rel of GUARD_RELS) {
      assert.ok(sameFile(at(dir, rel), at(INTEGRATION_SRC, rel)), `${rel} is the current template`);
    }
    // example.spec.ts was pristine v1.13.2: refreshed, so it no longer hits "invalid URL".
    assert.ok(sameFile(at(dir, 'playwright.config.ts'), at(INTEGRATION_SRC, 'playwright.config.ts')));
    assertCoherent(dir);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'package.json')), pkgBefore, 'package.json is never edited');
    assert.deepEqual(fs.readFileSync(path.join(dir, 'README.md')), readmeBefore);

    const listed = updatedList(result.stdout);
    assert.ok(listed.includes('qa/00-standards/write-safety-policy.md'));
    for (const rel of GUARD_RELS) assert.ok(listed.includes(INT + rel), `${rel} reported as updated`);
    assert.match(result.stdout, /\[created\] 00-standards\/write-safety-policy\.md/);
    assert.match(result.stdout, /\[updated\] integration\/tests\/example\.spec\.ts/);
    assert.match(result.stdout, /\[created\] integration\/scripts\/api-guard\.js/);
    // The v1.13.2 package.json has no test:write script; upgrade says so instead of editing it.
    assert.match(result.stdout, /integration\/package\.json has no "test:write" script[\s\S]*?node scripts\/run-write-tests\.js/);
    assert.doesNotMatch(result.stdout, /API guard[^\n]*NOT/);
    assert.doesNotMatch(result.stdout, /pre-1\.14 example/);
  });
});

test('delivery: a second run changes nothing and calls every delivered file up to date', () => {
  withProject(v1132Project, (root) => {
    assert.equal(runUpgrade(root).status, 0);
    const before = snapshot(root);
    const second = runUpgrade(root);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(snapshot(root), before);
    const fresh = updatedList(second.stdout).filter((p) => p.startsWith('qa/00-standards/') || p.startsWith(INT));
    assert.deepEqual(fresh, []);
    for (const rel of GUARD_RELS) assert.ok(upToDate(second.stdout).includes(INT + rel), `${rel} up to date`);
    assert.ok(upToDate(second.stdout).includes('qa/00-standards/write-safety-policy.md'));
  });
});

test('delivery: --dry-run reports the delivery and writes nothing', () => {
  withProject(v1132Project, (root) => {
    const before = snapshot(root);
    const result = runUpgrade(root, ['--dry-run']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(snapshot(root), before);
    const listed = updatedList(result.stdout);
    assert.ok(listed.includes('qa/00-standards/write-safety-policy.md'));
    for (const rel of GUARD_RELS) assert.ok(listed.includes(INT + rel), `${rel} reported`);
  });
});

// --- scenario 2: the project has its own fixtures/base.ts ------------------------

test('delivery: a project with its own fixtures/base.ts gets nothing that imports it, and is told', () => {
  const mine = "import { test as base } from '@playwright/test';\nexport const test = base;\n";
  withProject((root) => {
    v1132Project(root);
    const file = at(integration(root), 'fixtures/base.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, mine, 'utf8');
  }, (root) => {
    const dir = integration(root);
    const exampleBefore = fs.readFileSync(at(dir, 'tests/example.spec.ts'));
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    assert.equal(fs.readFileSync(at(dir, 'fixtures/base.ts'), 'utf8'), mine, 'their base.ts is untouched');
    for (const rel of NEW_IN_114.filter((r) => r !== 'fixtures/base.ts')) {
      assert.ok(!fs.existsSync(at(dir, rel)), `${rel} must not be installed next to a foreign base.ts`);
    }
    assert.deepEqual(fs.readFileSync(at(dir, 'tests/example.spec.ts')), exampleBefore, 'old example stays');
    assertCoherent(dir);

    assert.match(result.stdout, /integration\/fixtures\/base\.ts is user-owned - left untouched/);
    assert.match(result.stdout, /API guard \(read-only client, write gates\) NOT installed - integration\/fixtures\/base\.ts is yours/);
    assert.match(result.stdout, /integration\/scripts\/api-guard\.js/);
    assert.match(result.stdout, /integration\/tests\/example\.spec\.ts \(its previous version stays\)/);
    // The old example now runs under the refreshed config: say how it fails.
    assert.match(result.stdout, /tests\/example\.spec\.ts is the pre-1\.14 example[\s\S]*?"Invalid URL" when QA_BASE_URL is not set/);
    assert.ok(!keptList(result.stdout).includes(INT + 'tests/example.spec.ts'), 'a framework copy is not "your content"');
    for (const rel of NEW_IN_114) assert.ok(!updatedList(result.stdout).includes(INT + rel));
    // The standards document is independent of the integration scaffold.
    assert.ok(fs.existsSync(path.join(standards(root), 'write-safety-policy.md')));
  });
});

test('delivery: a foreign catalog blocks the first delivery of the whole group', () => {
  const mine = 'export const READ_CATALOG = [{ path: "/ours" }];\n';
  withProject((root) => {
    v1132Project(root);
    const file = at(integration(root), 'fixtures/read-catalog.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, mine, 'utf8');
  }, (root) => {
    const dir = integration(root);
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(at(dir, 'fixtures/read-catalog.ts'), 'utf8'), mine);
    for (const rel of NEW_IN_114.filter((r) => r !== 'fixtures/read-catalog.ts')) {
      assert.ok(!fs.existsSync(at(dir, rel)), `${rel} must not be installed`);
    }
    assertCoherent(dir);
    assert.match(result.stdout, /API guard \(read-only client, write gates\) NOT installed - these files are yours:\s+integration\/fixtures\/read-catalog\.ts/);
    assert.ok(keptList(result.stdout).includes(INT + 'fixtures/read-catalog.ts'));
  });
});

test('delivery: a foreign contract.ts keeps out only the tests that import it', () => {
  const mine = 'export const UNAUTHENTICATED_STATUSES = [403];\n';
  withProject((root) => {
    v1132Project(root);
    const file = at(integration(root), 'fixtures/contract.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, mine, 'utf8');
  }, (root) => {
    const dir = integration(root);
    const exampleBefore = fs.readFileSync(at(dir, 'tests/example.spec.ts'));
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);

    assert.equal(fs.readFileSync(at(dir, 'fixtures/contract.ts'), 'utf8'), mine);
    const importsContract = INTEGRATION_GUARD_FILES.filter((e) => e.deps.includes('fixtures/contract.ts')).map((e) => e.rel);
    for (const entry of INTEGRATION_GUARD_FILES) {
      if (entry.rel === 'fixtures/contract.ts' || entry.rel === 'tests/example.spec.ts') continue;
      assert.equal(fs.existsSync(at(dir, entry.rel)), !importsContract.includes(entry.rel), entry.rel);
    }
    assert.deepEqual(fs.readFileSync(at(dir, 'tests/example.spec.ts')), exampleBefore);
    assertCoherent(dir);
    assert.match(result.stdout, /tests\/security\/no-session\.spec\.ts \(needs fixtures\/contract\.ts\)/);
    assert.match(result.stdout, /tests\/example\.spec\.ts \(needs fixtures\/contract\.ts; its previous version stays\)/);
  });
});

// --- the project's own files in an installed guard --------------------------------

test('delivery: an installed guard keeps edited catalogs and examples, and restores a deleted test', () => {
  const catalog = 'export const READ_CATALOG = [] as const; // ours\n';
  const example = '// our real smoke test\n';
  withProject((root) => {
    freshInit(root);
    const dir = integration(root);
    fs.writeFileSync(at(dir, 'fixtures/read-catalog.ts'), catalog, 'utf8');
    fs.writeFileSync(at(dir, 'tests/example.spec.ts'), example, 'utf8');
    fs.rmSync(at(dir, 'tests/security/no-session.spec.ts'));
  }, (root) => {
    const dir = integration(root);
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(at(dir, 'fixtures/read-catalog.ts'), 'utf8'), catalog);
    assert.equal(fs.readFileSync(at(dir, 'tests/example.spec.ts'), 'utf8'), example);
    assert.ok(sameFile(at(dir, 'tests/security/no-session.spec.ts'), at(INTEGRATION_SRC, 'tests/security/no-session.spec.ts')));
    assertCoherent(dir);
    const kept = keptList(result.stdout);
    assert.ok(kept.includes(INT + 'fixtures/read-catalog.ts'));
    assert.ok(kept.includes(INT + 'tests/example.spec.ts'));
    assert.ok(!upToDate(result.stdout).includes(INT + 'fixtures/read-catalog.ts'));
    assert.match(result.stdout, /\[created\] integration\/tests\/security\/no-session\.spec\.ts/);
    assert.doesNotMatch(result.stdout, /API guard[^\n]*NOT/);
  });
});

test('delivery: a user-owned api-guard.js holds the scripts back and is never overwritten', () => {
  const mine = 'module.exports = { decideRead() { return { ok: true }; } };\n';
  withProject((root) => {
    freshInit(root);
    fs.writeFileSync(at(integration(root), 'scripts/api-guard.js'), mine, 'utf8');
    fs.rmSync(at(integration(root), 'scripts/run-write-tests.js'));
  }, (root) => {
    const dir = integration(root);
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(at(dir, 'scripts/api-guard.js'), 'utf8'), mine);
    assert.ok(!fs.existsSync(at(dir, 'scripts/run-write-tests.js')), 'not installed next to a foreign api-guard.js');
    assert.match(result.stdout, /API guard scripts NOT refreshed - user-owned:\s+integration\/scripts\/api-guard\.js[\s\S]*?Held back with them[\s\S]*?integration\/scripts\/run-write-tests\.js/);
  });
});

// --- scenario 3: an edited standards document ------------------------------------

test('delivery: edited standards documents are never touched; a missing one is installed', () => {
  const policy = '# Write safety policy\n\n## 0. Approver\n\nApprover: the QA lead of this project.\n';
  const bugTemplate = '# Our bug template\n';
  withProject((root) => {
    freshInit(root);
    fs.writeFileSync(path.join(standards(root), 'write-safety-policy.md'), policy, 'utf8');
    fs.writeFileSync(path.join(standards(root), 'bug-report-template.md'), bugTemplate, 'utf8');
    fs.rmSync(path.join(standards(root), 'test-data-guidelines.md'));
  }, (root) => {
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(standards(root), 'write-safety-policy.md'), 'utf8'), policy);
    assert.equal(fs.readFileSync(path.join(standards(root), 'bug-report-template.md'), 'utf8'), bugTemplate);
    assert.ok(sameFile(path.join(standards(root), 'test-data-guidelines.md'), path.join(TEMPLATES, 'test-data-guidelines.md')));

    const kept = keptList(result.stdout);
    assert.ok(kept.includes('qa/00-standards/write-safety-policy.md'));
    assert.ok(kept.includes('qa/00-standards/bug-report-template.md'));
    assert.ok(updatedList(result.stdout).includes('qa/00-standards/test-data-guidelines.md'));
    assert.ok(upToDate(result.stdout).includes('qa/00-standards/test-case-template.md'));
    for (const rel of ['write-safety-policy.md', 'bug-report-template.md']) {
      assert.ok(!upToDate(result.stdout).includes(`qa/00-standards/${rel}`), `${rel} is not "up to date"`);
      assert.ok(!updatedList(result.stdout).includes(`qa/00-standards/${rel}`));
    }
  });
});

// --- scenario 4: no integration scaffold -----------------------------------------

test('delivery: an integration/ holding only the pre-1.11 placeholder README gets nothing', () => {
  const placeholder = '# Integration Tests\n\n> Placeholder for API/integration tests (k6, JMeter, Azure Load Testing, etc.).\n> Each tool gets its own subdirectory.\n';
  withProject((root) => {
    freshInit(root);
    fs.rmSync(integration(root), { recursive: true, force: true });
    fs.mkdirSync(integration(root), { recursive: true });
    fs.writeFileSync(path.join(integration(root), 'README.md'), placeholder, 'utf8');
  }, (root) => {
    const before = snapshot(integration(root));
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(snapshot(integration(root)), before);
    // A path segment named integration, with either separator: `/integration\//` never
    // matched on Windows (backslash paths, so the assertion passed without checking
    // anything) and matched skill names such as qa-api-integration/ on Linux.
    assert.doesNotMatch(result.stdout, /(?<![\w-])integration[\\/]/);
  });
});

test('delivery: a project with no integration/ at all gets the same coherent scaffold as init', () => {
  withProject((root) => {
    freshInit(root);
    fs.rmSync(integration(root), { recursive: true, force: true });
  }, (root) => {
    const result = runUpgrade(root);
    assert.equal(result.status, 0, result.stderr);
    assertCoherent(integration(root));
    withProject(freshInit, (reference) => {
      assert.deepEqual(snapshot(integration(root)), snapshot(integration(reference)));
    });
  });
});
