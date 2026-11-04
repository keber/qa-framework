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
