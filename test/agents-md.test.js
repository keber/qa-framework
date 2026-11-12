'use strict';

// AGENTS.md review-rulebook template (survey items B6 and C12).
//
// The template ships in templates/AGENTS.md. init installs it as
// qa/00-standards/agents-md-template.md, only when missing (a STANDARDS_DOCS entry, so
// upgrade delivers it the same way), and neither command ever writes a root AGENTS.md:
// that file is auto-loaded by several coding agents, so it is project-owned and must be
// created by the project, not by a package postinstall. Neither command edits an
// existing copy of either file.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'templates', 'AGENTS.md');
const INIT_PATH = path.join(ROOT, 'scripts', 'init.js');
const UPGRADE_PATH = path.join(ROOT, 'scripts', 'upgrade.js');
const INSTALLED_REL = ['qa', '00-standards', 'agents-md-template.md'];

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-agents-md-'));
}

function readTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

// --- Template content ---

test('agents-md template: exists and is UTF-8 without BOM', () => {
  const raw = fs.readFileSync(TEMPLATE_PATH);
  assert.ok(raw.length > 0);
  assert.notDeepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('agents-md template: has the converged ten numbered sections in order', () => {
  const headings = readTemplate()
    .split(/\r?\n/)
    .filter((line) => /^## \d+\. /.test(line))
    .map((line) => Number(line.match(/^## (\d+)\. /)[1]));
  assert.deepEqual(headings, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('agents-md template: section 10 is "What NOT to report as a finding"', () => {
  assert.match(readTemplate(), /^## 10\. What NOT to report as a finding$/m);
});

test('agents-md template: carries the converged rule prefixes', () => {
  const content = readTemplate();
  for (const prefix of ['S', 'A', 'T', 'E', 'H', 'L', 'P', 'C']) {
    assert.match(content, new RegExp(`\\| ${prefix}1 \\|`), `missing rule ${prefix}1`);
  }
});

test('agents-md template: has a tracked exceptions register with ID, justification and no-new-callers columns', () => {
  const content = readTemplate();
  assert.match(content, /^### \d+\.\d+ Tracked exceptions$/m);
  assert.match(content, /\| ID \|.*Justification.*\|.*New callers.*\|/);
  // Section 10 tells reviewers not to re-report a registered exception.
  const section10 = content.slice(content.indexOf('## 10. '));
  assert.match(section10, /tracked exceptions/i);
});

test('agents-md template: the encoding section keeps the accent clause with the prohibition', () => {
  const content = readTemplate();
  const section2 = content.slice(content.indexOf('## 2. '), content.indexOf('## 3. '));
  assert.match(section2, /U\+2014/);
  assert.match(section2, /accent/i);
  assert.match(section2, /\.ps1/);
});

test('agents-md template: contains no consumer-project specifics', () => {
  const content = readTemplate();
  const denylist = [
    /garc[eé]s/i, /biofruit/i, /enrolamiento/i, /sispro/i, /gmo/i, /exportadora/i,
    /nexus/i, /bioacsys/i, /blazor/i, /radzen/i, /DEF-SIS/, /\bgf-/, /\bRUT\b/,
    /21\.719/, /https?:\/\//,
  ];
  for (const pattern of denylist) {
    assert.doesNotMatch(content, pattern, `template leaks ${pattern}`);
  }
});

// --- Installation ---

test('init: installs the template as qa/00-standards/agents-md-template.md and writes no root AGENTS.md', () => {
  const projectRoot = tmpProject();
  try {
    const result = run(INIT_PATH, [], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    const installed = path.join(projectRoot, ...INSTALLED_REL);
    assert.equal(fs.readFileSync(installed, 'utf8'), readTemplate());
    assert.equal(fs.existsSync(path.join(projectRoot, 'AGENTS.md')), false);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('init: leaves an existing root AGENTS.md and an edited installed template untouched', () => {
  const projectRoot = tmpProject();
  try {
    const rootAgents = path.join(projectRoot, 'AGENTS.md');
    fs.writeFileSync(rootAgents, '# Project rules\n', 'utf8');
    const installed = path.join(projectRoot, ...INSTALLED_REL);
    fs.mkdirSync(path.dirname(installed), { recursive: true });
    fs.writeFileSync(installed, '# Edited by the project\n', 'utf8');

    const result = run(INIT_PATH, [], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(rootAgents, 'utf8'), '# Project rules\n');
    assert.equal(fs.readFileSync(installed, 'utf8'), '# Edited by the project\n');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('init: AGENT-NEXT-STEPS.md tells the agent how to adopt the template', () => {
  const projectRoot = tmpProject();
  try {
    run(INIT_PATH, [], projectRoot);
    const nextSteps = fs.readFileSync(path.join(projectRoot, 'qa', 'AGENT-NEXT-STEPS.md'), 'utf8');
    assert.match(nextSteps, /qa\/00-standards\/agents-md-template\.md/);
    assert.match(nextSteps, /AGENTS\.md/);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('upgrade: delivers the template when missing, never creates a root AGENTS.md, never edits either file', () => {
  const projectRoot = tmpProject();
  try {
    assert.equal(run(INIT_PATH, [], projectRoot).status, 0);
    const installed = path.join(projectRoot, ...INSTALLED_REL);

    // Project initialised before the template existed: upgrade delivers it under
    // qa/00-standards/ and still does not create a root AGENTS.md.
    fs.rmSync(installed);
    let result = run(UPGRADE_PATH, [], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(installed, 'utf8'), readTemplate());
    assert.equal(fs.existsSync(path.join(projectRoot, 'AGENTS.md')), false);

    // Project-edited files: upgrade must leave both byte-identical.
    const rootAgents = path.join(projectRoot, 'AGENTS.md');
    fs.writeFileSync(rootAgents, '# Project rules\n', 'utf8');
    fs.writeFileSync(installed, '# Edited by the project\n', 'utf8');
    result = run(UPGRADE_PATH, [], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(rootAgents, 'utf8'), '# Project rules\n');
    assert.equal(fs.readFileSync(installed, 'utf8'), '# Edited by the project\n');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
