'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const INIT_PATH = path.join(__dirname, '..', 'scripts', 'init.js');

const SPEC_FILES = [
  '00-inventory.md',
  '01-business-rules.md',
  '02-workflows.md',
  '03-roles-permissions.md',
  '04-test-data.md',
  '05-test-scenarios.md',
];

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

test('init: scaffolds module specs under qa/01-specifications/{module}/{submodule}/', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    const moduleKey = 'module-suppliers';
    const subKey = 'submodule-create';
    const configPath = path.join(projectRoot, 'my-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      frameworkVersion: '1.11.3',
      project: { name: 'demo', displayName: 'Demo' },
      modules: [
        {
          key: moduleKey,
          name: 'Suppliers',
          submodules: [{ key: subKey, name: 'Create' }],
        },
      ],
      conventions: { qaRoot: 'qa' },
    }));

    const result = runInit(['--config', 'my-config.json'], projectRoot);
    assert.equal(result.status, 0);

    // The 6 spec files land under the authoritative 01-specifications/ home.
    const specDir = path.join(projectRoot, 'qa', '01-specifications', moduleKey, subKey);
    for (const specFile of SPEC_FILES) {
      assert.ok(
        fs.existsSync(path.join(specDir, specFile)),
        `expected spec file at qa/01-specifications/${moduleKey}/${subKey}/${specFile}`
      );
    }

    // Nothing is created at the old top-level qa/{module}/ location.
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'qa', moduleKey)),
      false,
      `qa/${moduleKey}/ must not be created at the top level`
    );

    // The e2e stub lands under e2e/tests/{module}/ keyed by the BARE name: the
    // module-/submodule- prefix belongs to the spec tree only.
    assert.ok(
      fs.existsSync(path.join(
        projectRoot, 'qa', '07-automation', 'e2e', 'tests', 'suppliers', 'create.spec.ts'
      )),
      'expected e2e stub at qa/07-automation/e2e/tests/suppliers/create.spec.ts'
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});


// A module declared with a bare key must still land in the prefixed spec folder:
// every skill, docs/folder-structure-guide.md and the specPath in the config declare
// module-{name}/submodule-{name}. init.js used to write the bare key straight through,
// so a scaffolded project violated the convention its own agent instructions impose.
test('init: bare module keys are prefixed in specs and left bare in automation', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    const configPath = path.join(projectRoot, 'my-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      frameworkVersion: '1.12.0',
      project: { name: 'demo', displayName: 'Demo' },
      modules: [
        {
          key: 'suppliers',
          name: 'Suppliers',
          submodules: [{ key: 'create', name: 'Create' }],
        },
      ],
      conventions: { qaRoot: 'qa' },
    }));

    const result = runInit(['--config', 'my-config.json'], projectRoot);
    assert.equal(result.status, 0);

    // Specs: prefixed.
    assert.ok(
      fs.existsSync(path.join(
        projectRoot, 'qa', '01-specifications', 'module-suppliers', 'submodule-create', '00-inventory.md'
      )),
      'expected specs at qa/01-specifications/module-suppliers/submodule-create/'
    );
    assert.equal(
      fs.existsSync(path.join(projectRoot, 'qa', '01-specifications', 'suppliers')),
      false,
      'an unprefixed module folder must not be created under 01-specifications/'
    );

    // Automation: bare, matching automationPath and the live consuming projects.
    assert.ok(
      fs.existsSync(path.join(
        projectRoot, 'qa', '07-automation', 'e2e', 'tests', 'suppliers', 'create.spec.ts'
      )),
      'expected e2e stub at qa/07-automation/e2e/tests/suppliers/create.spec.ts'
    );

    // TC ids are built from the bare key, never TC-MODULE-SUPPLIERS-SUBMODULE-CREATE.
    const specTs = fs.readFileSync(path.join(
      projectRoot, 'qa', '07-automation', 'e2e', 'tests', 'suppliers', 'create.spec.ts'
    ), 'utf8');
    assert.ok(specTs.includes('[TC-SUPPLIERS-CREATE-001]'), specTs);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

// Prefixing is idempotent: a config that already spells the key as "module-suppliers"
// must not produce qa/01-specifications/module-module-suppliers/.
test('init: keys that already carry the prefix are not prefixed twice', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    const configPath = path.join(projectRoot, 'my-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      project: { name: 'demo' },
      modules: [
        {
          key: 'module-suppliers',
          name: 'Suppliers',
          submodules: [{ key: 'submodule-create', name: 'Create' }],
        },
      ],
      conventions: { qaRoot: 'qa' },
    }));

    assert.equal(runInit(['--config', 'my-config.json'], projectRoot).status, 0);

    assert.equal(
      fs.existsSync(path.join(projectRoot, 'qa', '01-specifications', 'module-module-suppliers')),
      false,
      'the module- prefix must not be applied twice'
    );
    assert.ok(fs.existsSync(path.join(
      projectRoot, 'qa', '01-specifications', 'module-suppliers', 'submodule-create', '00-inventory.md'
    )));
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

// ---------------------------------------------------------------------------
// .claude/agents/ - sprint-cycle subagents
// ---------------------------------------------------------------------------

const SPRINT_AGENTS = [
  'qa-analisis',
  'qa-plan',
  'qa-asesoria',
  'qa-informe-resultados',
  'qa-reporte-ejecucion',
  'qa-investigador',
];

function writeRootConfig(projectRoot, config) {
  fs.writeFileSync(path.join(projectRoot, 'qa-framework.config.json'), JSON.stringify(config, null, 2));
}

const agentPath = (root, name) => path.join(root, '.claude', 'agents', `${name}.md`);

test('init: sprintCycle enabled generates the six agents without leftover placeholders', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    writeRootConfig(projectRoot, {
      project: { name: 'demo', displayName: 'Demo' },
      integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
    });
    const result = runInit([], projectRoot);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const name of SPRINT_AGENTS) {
      assert.ok(fs.existsSync(agentPath(projectRoot, name)), `expected .claude/agents/${name}.md`);
      assert.doesNotMatch(fs.readFileSync(agentPath(projectRoot, name), 'utf8'), /\{\{/);
    }
    assert.match(result.stdout, /qa-reporte-ejecucion/);
    assert.match(result.stdout, /qa-investigador/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('init: sprintCycle disabled generates no agents', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    writeRootConfig(projectRoot, {
      project: { name: 'demo' },
      integrations: { azureDevOps: { sprintCycle: { enabled: false } } },
    });
    const result = runInit([], projectRoot);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    for (const name of SPRINT_AGENTS) {
      assert.equal(fs.existsSync(agentPath(projectRoot, name)), false, `${name} must not be generated`);
    }
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('init: an invalid lane config fails qa-investigador only, writes the other five, exits 1', () => {
  for (const parallelLanes of [
    { enabled: true, lanes: [{ id: '1', account: 'QA_USER', storageState: '.auth/a.json', mcpNamespace: 'mcp__playwright' }] },
    { enabled: true, lanes: [] },
  ]) {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
    try {
      writeRootConfig(projectRoot, {
        project: { name: 'demo' },
        parallelLanes,
        integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
      });
      const result = runInit([], projectRoot);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.match(result.stderr, /qa-investigador/);
      assert.equal(fs.existsSync(agentPath(projectRoot, 'qa-investigador')), false);
      for (const name of SPRINT_AGENTS.filter((n) => n !== 'qa-investigador')) {
        assert.ok(fs.existsSync(agentPath(projectRoot, name)), `expected .claude/agents/${name}.md`);
      }
      // READ-008: the summary must not list an agent that was not generated.
      //
      // Match either path separator. init.js prints these lines through
      // path.relative, so the same output reads ".claude/agents/..." on Linux and
      // ".claude\agents\..." on Windows. Keying on the forward-slash form alone,
      // and taking the FIRST matching line, made this assertion land on the summary
      // line on Windows (where the per-file "[created]" lines never matched) and on
      // the first "[created] .claude/agents/qa-analisis.md" line on Linux - so it
      // passed locally and failed on CI. Check every agent line instead of guessing
      // which one carries the summary.
      const agentLines = result.stdout
        .split(/\r?\n/)
        .filter((l) => /\.claude[\\\/]agents/.test(l));
      assert.ok(agentLines.length, 'summary must still list the generated agents');
      for (const line of agentLines) {
        assert.doesNotMatch(line, /qa-investigador/);
      }
      assert.ok(
        agentLines.some((l) => l.includes('qa-reporte-ejecucion')),
        'the generated agents must include qa-reporte-ejecucion'
      );
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  }
});

// RES-001: as npm postinstall, a non-zero exit fails `npm install` of the package itself.
test('init --skip-if-exists (postinstall): an agent render failure is a warning and exits 0', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    writeRootConfig(projectRoot, {
      project: { name: 'demo' },
      parallelLanes: {
        enabled: true,
        lanes: [{ id: '1', account: 'QA_USER', storageState: '.auth/a.json', mcpNamespace: 'mcp__playwright' }],
      },
      integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
    });
    const result = runInit(['--skip-if-exists'], projectRoot);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stderr, /WARNING/);
    assert.match(result.stderr, /qa-investigador/);
    assert.match(result.stderr, /npx qa-framework upgrade/);
    assert.equal(fs.existsSync(agentPath(projectRoot, 'qa-investigador')), false);
    for (const name of SPRINT_AGENTS.filter((n) => n !== 'qa-investigador')) {
      assert.ok(fs.existsSync(agentPath(projectRoot, name)), `expected .claude/agents/${name}.md`);
    }
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('init: installs the write-safety policy in qa/00-standards/ from the template', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    const result = runInit([], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    const installed = path.join(projectRoot, 'qa', '00-standards', 'write-safety-policy.md');
    assert.ok(fs.existsSync(installed), 'write-safety-policy.md not installed');
    const template = fs.readFileSync(
      path.join(__dirname, '..', 'templates', 'write-safety-policy.md'), 'utf8'
    );
    assert.equal(fs.readFileSync(installed, 'utf8'), template);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('init: never overwrites a project-edited write-safety policy', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    runInit([], projectRoot);
    const installed = path.join(projectRoot, 'qa', '00-standards', 'write-safety-policy.md');
    fs.writeFileSync(installed, '# Edited by the project\n', 'utf8');
    const result = runInit([], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(installed, 'utf8'), '# Edited by the project\n');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

// --- Integration scaffold: read-only guard and write gates (WP2.2) -------------------

function listTemplateFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTemplateFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

test('init: installs every file of the integration scaffold, guard and write gates included', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    const result = runInit([], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    const src = path.join(__dirname, '..', 'templates', 'integration-scaffold');
    const dest = path.join(projectRoot, 'qa', '07-automation', 'integration');
    const files = listTemplateFiles(src);
    for (const rel of [
      'scripts/api-guard.js',
      'scripts/hard-exclusions.js',
      'scripts/run-write-tests.js',
      'fixtures/base.ts',
      'fixtures/read-catalog.ts',
      'fixtures/write-catalog.ts',
      'fixtures/project-exclusions.ts',
      'fixtures/contract.ts',
      'tests/security/read-only-guard.spec.ts',
      'tests/security/no-session.spec.ts',
      'tests/write/example-write-cycle.spec.ts',
    ]) {
      assert.ok(files.includes(rel), `template is missing ${rel}`);
    }
    for (const rel of files) {
      const installed = path.join(dest, ...rel.split('/'));
      assert.ok(fs.existsSync(installed), `init did not install integration/${rel}`);
      assert.equal(
        fs.readFileSync(installed, 'utf8'),
        fs.readFileSync(path.join(src, ...rel.split('/')), 'utf8'),
        `integration/${rel} differs from the template`
      );
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(dest, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.test, 'playwright test', 'npm test stays read-only');
    assert.equal(pkg.scripts['test:write'], 'node scripts/run-write-tests.js');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('init: never overwrites an existing integration catalog or guard file', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-init-'));
  try {
    const dest = path.join(projectRoot, 'qa', '07-automation', 'integration');
    const catalog = path.join(dest, 'fixtures', 'write-catalog.ts');
    const exclusions = path.join(dest, 'fixtures', 'project-exclusions.ts');
    fs.mkdirSync(path.dirname(catalog), { recursive: true });
    fs.writeFileSync(catalog, '// project write catalog\n', 'utf8');
    fs.writeFileSync(exclusions, '// project exclusions\n', 'utf8');

    const result = runInit([], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(catalog, 'utf8'), '// project write catalog\n');
    assert.equal(fs.readFileSync(exclusions, 'utf8'), '// project exclusions\n');
    assert.ok(fs.existsSync(path.join(dest, 'scripts', 'api-guard.js')), 'the rest is still installed');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('run-write-tests --dry-run prints the warning and runs nothing', () => {
  const script = path.join(__dirname, '..', 'templates', 'integration-scaffold', 'scripts', 'run-write-tests.js');
  const r = spawnSync(process.execPath, [script, '--dry-run'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /API WRITE TESTS/);
  assert.match(r.stdout, /--dry-run: nothing was run/);
});
