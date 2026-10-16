'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const VALIDATE_PATH = path.join(__dirname, '..', 'scripts', 'validate.js');
const INIT_PATH = path.join(__dirname, '..', 'scripts', 'init.js');

const REQUIRED_TOP_FOLDERS = ['00-standards', '05-test-execution', '06-defects', '07-automation'];
const SPEC_FILES = [
  '00-inventory.md',
  '01-business-rules.md',
  '02-workflows.md',
  '03-roles-permissions.md',
  '04-test-data.md',
  '05-test-scenarios.md',
];

function runValidate(args, cwd) {
  return spawnSync(process.execPath, [VALIDATE_PATH, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function makeTmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-validate-'));
}

const MODULE_KEY = 'module-suppliers';
const SUB_KEY = 'submodule-create';
// Automation paths drop the prefix - see scripts/lib/module-keys.js.
const MODULE_BARE = 'suppliers';
const SUB_BARE = 'create';

// Builds the authoritative spec layout: qa/01-specifications/{module}/{submodule}/.
// This is what init.js writes, what all 8 skills declare, and what the three live
// consuming projects actually contain.
function makeCompleteQaStructure(projectRoot) {
  const qaRoot = path.join(projectRoot, 'qa');
  for (const folder of REQUIRED_TOP_FOLDERS) {
    fs.mkdirSync(path.join(qaRoot, folder), { recursive: true });
  }
  const subDir = path.join(qaRoot, '01-specifications', MODULE_KEY, SUB_KEY);
  fs.mkdirSync(subDir, { recursive: true });
  for (const specFile of SPEC_FILES) {
    fs.writeFileSync(path.join(subDir, specFile), `# ${specFile}\n`);
  }
  return qaRoot;
}

test('validate: missing required folders are reported as errors and exit code is 1', () => {
  const projectRoot = makeTmpProject();
  try {
    fs.mkdirSync(path.join(projectRoot, 'qa'), { recursive: true });
    const result = runValidate([], projectRoot);
    assert.equal(result.status, 1);
    for (const folder of REQUIRED_TOP_FOLDERS) {
      assert.match(result.stdout, new RegExp(`Missing required folder: qa/${folder}/`));
    }
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate: the authoritative spec layout passes validation', () => {
  const projectRoot = makeTmpProject();
  try {
    makeCompleteQaStructure(projectRoot);
    const result = runValidate([], projectRoot);
    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /Missing spec file/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate: missing spec files in a submodule are reported as errors', () => {
  const projectRoot = makeTmpProject();
  try {
    const qaRoot = path.join(projectRoot, 'qa');
    for (const folder of REQUIRED_TOP_FOLDERS) {
      fs.mkdirSync(path.join(qaRoot, folder), { recursive: true });
    }
    fs.mkdirSync(path.join(qaRoot, '01-specifications', 'module-suppliers', 'submodule-create'), { recursive: true });
    const result = runValidate([], projectRoot);
    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /Missing spec file: qa\/01-specifications\/module-suppliers\/submodule-create\/00-inventory\.md/
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

// The automation-spec warning must point at e2e/tests/{module}/{submodule}.spec.ts
// keyed by the BARE name, matching where init.js writes the stub, what automationPath
// declares and what the live projects contain. The spec tree keeps its module-/
// submodule- prefix; the automation tree never had one.
test('validate: --strict automation-spec warning points at the e2e/tests/ path', () => {
  const projectRoot = makeTmpProject();
  try {
    makeCompleteQaStructure(projectRoot);
    const result = runValidate(['--strict'], projectRoot);
    assert.match(result.stdout, /Mode: STRICT/);
    assert.match(
      result.stdout,
      new RegExp(
        `\\[STRICT\\] No automation spec found: qa/07-automation/e2e/tests/${MODULE_BARE}/${SUB_BARE}\\.spec\\.ts`
      )
    );
    // Guard against a regression back to the pre-v1.6.0 e2e/{module}/ layout.
    assert.doesNotMatch(
      result.stdout,
      /No automation spec found: qa\/07-automation\/e2e\/(?!tests\/)/
    );
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

// Round-trip: the scaffold init.js produces must pass validate. The absence of
// this test is what let the spec-path defects ship - init and validate each
// looked correct in isolation while disagreeing about where specs live.
test('validate: a freshly scaffolded project from init.js passes validation', () => {
  const projectRoot = makeTmpProject();
  try {
    const config = {
      modules: [
        {
          code: 'SUP',
          name: 'Suppliers',
          key: MODULE_KEY,
          submodules: [{ code: 'CRE', name: 'Create', key: SUB_KEY }],
        },
      ],
    };
    fs.writeFileSync(
      path.join(projectRoot, 'qa-framework.config.json'),
      JSON.stringify(config, null, 2)
    );

    const initResult = spawnSync(process.execPath, [INIT_PATH], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: { ...process.env, INIT_CWD: projectRoot },
    });
    assert.equal(initResult.status, 0, initResult.stdout + initResult.stderr);

    // The scaffold must land at the authoritative depth.
    assert.ok(fs.existsSync(
      path.join(projectRoot, 'qa', '01-specifications', MODULE_KEY, SUB_KEY, '00-inventory.md')
    ));

    const result = runValidate([], projectRoot);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.doesNotMatch(result.stdout, /Missing spec file/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

// Sibling folders under qa/ hold their own subdirectories that are not modules.
// The scan is rooted at 01-specifications/, so it must never visit them - this
// pins the removal of SKIP_DIRS, which previously had to enumerate them by hand
// and omitted these four.
test('validate: non-spec sibling folders under qa/ produce no spurious spec errors', () => {
  const projectRoot = makeTmpProject();
  try {
    const qaRoot = makeCompleteQaStructure(projectRoot);
    for (const dir of [
      ['02-test-plans', 'sprints'],
      ['02-test-plans', 'historical'],
      ['03-test-cases', 'module-suppliers'],
      ['04-test-data', 'seeders'],
      ['memory', 'prompts'],
    ]) {
      const full = path.join(qaRoot, ...dir);
      fs.mkdirSync(full, { recursive: true });
      fs.writeFileSync(path.join(full, 'notes.md'), '# notes\n');
    }

    const result = runValidate([], projectRoot);
    assert.equal(result.status, 0, result.stdout);
    assert.doesNotMatch(result.stdout, /Missing spec file/);
    for (const dir of ['02-test-plans', '03-test-cases', '04-test-data', 'memory']) {
      assert.doesNotMatch(result.stdout, new RegExp(`qa/${dir}/`));
    }
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

// docs/folder-structure-guide.md documents README.md and shared/ as legitimate
// non-module entries directly under 01-specifications/. shared/ is a directory,
// so the scan reaches it; its contents are not submodules and must not be
// required to carry the 6 spec files.
test('validate: a shared/ directory under 01-specifications/ is not treated as a module', () => {
  const projectRoot = makeTmpProject();
  try {
    const qaRoot = makeCompleteQaStructure(projectRoot);
    const sharedDir = path.join(qaRoot, '01-specifications', 'shared');
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.writeFileSync(path.join(sharedDir, 'ui-menu-map.md'), '# menu\n');
    fs.writeFileSync(path.join(qaRoot, '01-specifications', 'README.md'), '# index\n');

    const result = runValidate([], projectRoot);
    assert.equal(result.status, 0, result.stdout);
    assert.doesNotMatch(result.stdout, /shared/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('validate: --config points to a custom config file with a custom qaRoot', () => {
  const projectRoot = makeTmpProject();
  try {
    const customRoot = path.join(projectRoot, 'custom-qa');
    for (const folder of REQUIRED_TOP_FOLDERS) {
      fs.mkdirSync(path.join(customRoot, folder), { recursive: true });
    }
    const configPath = path.join(projectRoot, 'my-config.json');
    fs.writeFileSync(configPath, JSON.stringify({ conventions: { qaRoot: 'custom-qa' } }));
    const result = runValidate(['--config', 'my-config.json'], projectRoot);
    assert.equal(result.status, 0);
    assert.match(result.stdout, new RegExp(`Validating: ${customRoot.replace(/\\/g, '\\\\')}`));
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Config value checks (v1.13.0)
// ---------------------------------------------------------------------------

function validateWithConfig(config, where = 'root') {
  const projectRoot = makeTmpProject();
  try {
    makeCompleteQaStructure(projectRoot);
    const configPath = where === 'root'
      ? path.join(projectRoot, 'qa-framework.config.json')
      : path.join(projectRoot, 'qa', 'qa-framework.config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return runValidate([], projectRoot);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

const sprintCycle = (extra) => ({ integrations: { azureDevOps: { sprintCycle: { enabled: true, ...extra } } } });

test('validate: absent optional config keys produce no config errors', () => {
  const result = validateWithConfig({ project: { name: 'demo' }, ...sprintCycle({}) });
  assert.equal(result.status, 0, result.stdout);
  assert.doesNotMatch(result.stdout, /Invalid config/);
});

test('validate: valid optional config keys produce no config errors', () => {
  const result = validateWithConfig({
    conventions: { decimalSeparator: '.', defectIdPrefix: 'ACME-2' },
    parallelLanes: {
      enabled: true,
      lanes: [{ id: '1', account: 'QA_USER', storageState: '.auth/a.json', mcpNamespace: 'mcp__playwright-qauser__' }],
    },
    ...sprintCycle({ approvalThresholdPercent: 100 }),
  });
  assert.equal(result.status, 0, result.stdout);
});

for (const bad of [0, 150, -5, '85']) {
  test(`validate: approvalThresholdPercent ${JSON.stringify(bad)} is an error`, () => {
    const result = validateWithConfig(sprintCycle({ approvalThresholdPercent: bad }));
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /approvalThresholdPercent/);
  });
}

test('validate: an invalid decimalSeparator is an error', () => {
  const result = validateWithConfig({ conventions: { decimalSeparator: ';' } });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /decimalSeparator/);
});

test('validate: an invalid defectIdPrefix is an error', () => {
  const result = validateWithConfig({ conventions: { defectIdPrefix: 'acme prefix' } });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /defectIdPrefix/);
});

test('validate: an invalid mcpNamespace is an error (config under qa/)', () => {
  const result = validateWithConfig({
    parallelLanes: {
      enabled: true,
      lanes: [{ id: '1', account: 'QA_USER', storageState: '.auth/a.json', mcpNamespace: 'playwright-qauser' }],
    },
  }, 'qa');
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /mcpNamespace/);
});

test('validate: an invalid parallelLanes block is an error', () => {
  const result = validateWithConfig({ parallelLanes: { enabled: true, lanes: [] } });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stdout, /parallelLanes/);
});
