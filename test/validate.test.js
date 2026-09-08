'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const VALIDATE_PATH = path.join(__dirname, '..', 'scripts', 'validate.js');

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

// KNOWN DEFECT (out of scope here, tracked separately): validate.js's directory
// scan treats every top-level qa/ directory as a module. With the authoritative
// layout it therefore reads 01-specifications/ as the module and module-suppliers/
// as the submodule, and demands the 6 spec files one level too high. A correctly
// scaffolded project consequently fails validation. This test pins that real
// current behavior rather than padding the fixture with module-level spec files
// that no real project has; flip it to expect exit 0 when the scan is fixed.
test('validate: authoritative spec layout currently fails due to the off-by-one module scan', () => {
  const projectRoot = makeTmpProject();
  try {
    makeCompleteQaStructure(projectRoot);
    const result = runValidate([], projectRoot);
    assert.equal(result.status, 1);
    for (const specFile of SPEC_FILES) {
      assert.match(
        result.stdout,
        new RegExp(`Missing spec file: qa/01-specifications/${MODULE_KEY}/${specFile.replace('.', '\\.')}`)
      );
    }
    // The real spec files are present at the documented depth.
    for (const specFile of SPEC_FILES) {
      assert.ok(fs.existsSync(
        path.join(projectRoot, 'qa', '01-specifications', MODULE_KEY, SUB_KEY, specFile)
      ));
    }
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
    fs.mkdirSync(path.join(qaRoot, 'suppliers', 'create'), { recursive: true });
    const result = runValidate([], projectRoot);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Missing spec file: qa\/suppliers\/create\/00-inventory\.md/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

// The automation-spec warning must point at e2e/tests/, matching where init.js
// writes the stub and where the v1.6.0 migration in upgrade.js moved specs to.
// Note: the directory segments after e2e/tests/ are skewed by the same
// out-of-scope off-by-one scan described above, so this asserts the 'tests'
// segment specifically - that is the part this change fixes.
test('validate: --strict automation-spec warning points at the e2e/tests/ path', () => {
  const projectRoot = makeTmpProject();
  try {
    makeCompleteQaStructure(projectRoot);
    const result = runValidate(['--strict'], projectRoot);
    assert.match(result.stdout, /Mode: STRICT/);
    assert.match(
      result.stdout,
      /\[STRICT\] No automation spec found: qa\/07-automation\/e2e\/tests\//
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
