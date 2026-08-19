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

function makeCompleteQaStructure(projectRoot) {
  const qaRoot = path.join(projectRoot, 'qa');
  for (const folder of REQUIRED_TOP_FOLDERS) {
    fs.mkdirSync(path.join(qaRoot, folder), { recursive: true });
  }
  const subDir = path.join(qaRoot, 'suppliers', 'create');
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

test('validate: complete qa/ structure passes with exit code 0', () => {
  const projectRoot = makeTmpProject();
  try {
    makeCompleteQaStructure(projectRoot);
    const result = runValidate([], projectRoot);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Validation passed/);
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

test('validate: --strict warns about missing automation spec but still exits 0 when no errors', () => {
  const projectRoot = makeTmpProject();
  try {
    makeCompleteQaStructure(projectRoot);
    const result = runValidate(['--strict'], projectRoot);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Mode: STRICT/);
    assert.match(result.stdout, /\[STRICT\] No automation spec found: qa\/07-automation\/e2e\/suppliers\/create\.spec\.ts/);
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
