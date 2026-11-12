'use strict';

// WP2.3: the qa-api-integration skill and the API testing conventions document.
// The skill describes the integration scaffold and the write-safety policy that ship
// in templates/, so these tests tie every file and name it mentions to the real ones:
// a rename in the scaffold fails here instead of leaving the agent with stale advice.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const { scanText } = require('../scripts/check-forbidden-chars.js');
const { buildCommandContent } = require('../scripts/lib/claude-commands.js');

const REPO_ROOT = path.join(__dirname, '..');
const SKILL_DIR = path.join(REPO_ROOT, 'skills', 'qa-api-integration');
const SKILL_FILE = path.join(SKILL_DIR, 'SKILL.md');
const SCAFFOLD = path.join(REPO_ROOT, 'templates', 'integration-scaffold');
const CONVENTIONS_TEMPLATE = path.join(REPO_ROOT, 'templates', 'api-testing-conventions.md');
const INIT_PATH = path.join(REPO_ROOT, 'scripts', 'init.js');
const UPGRADE_PATH = path.join(REPO_ROOT, 'scripts', 'upgrade.js');

// Line endings normalized: a checkout with core.autocrlf gives CRLF working copies.
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function skillFiles() {
  const refs = path.join(SKILL_DIR, 'references');
  return [SKILL_FILE, ...fs.readdirSync(refs).map((name) => path.join(refs, name))];
}

const authoredFiles = () => [...skillFiles(), CONVENTIONS_TEMPLATE];

function run(script, cwd) {
  return spawnSync(process.execPath, [script], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}

function withProject(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-api-skill-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// --- The skill -------------------------------------------------------------------------

test('qa-api-integration: SKILL.md has the frontmatter of the other skills and places itself in stage 5', () => {
  const text = read(SKILL_FILE);
  const front = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(front, 'SKILL.md must start with a YAML frontmatter block');
  assert.match(front[1], /^name: qa-api-integration$/m);
  assert.match(front[1], /^description: >/m);
  assert.match(text, /\*\*Stage\*\*: 5 - Automation/);
  assert.match(text, /it is not a new stage/);
});

test('qa-api-integration: every scaffold file the skill names exists in templates/integration-scaffold', () => {
  const PATH_RE = /\b(?:fixtures|scripts|tests)\/[A-Za-z0-9._/-]+\.(?:ts|js)\b/g;
  const named = new Set(skillFiles().flatMap((file) => read(file).match(PATH_RE) || []));
  // Paths a project creates itself, shown as examples of the naming convention.
  const projectExamples = new Set([
    'tests/items/items-listing.spec.ts',
    'tests/write/items-cycle.spec.ts',
  ]);
  const missing = [...named].filter((rel) => !projectExamples.has(rel) && !fs.existsSync(path.join(SCAFFOLD, rel)));
  assert.ok(named.size >= 8, `expected the skill to name the scaffold files, found ${[...named].join(', ')}`);
  assert.deepEqual(missing, []);
});

test('qa-api-integration: every scaffold identifier the skill relies on exists in the scaffold', () => {
  const sources = {
    'fixtures/base.ts': ['read(', 'write(', 'pickOwnRecord', 'authenticatedClient', 'api:', 'anonymous:'],
    'fixtures/contract.ts': ['expectJson', 'expectApiResponse', 'expectUnauthenticated', 'UNAUTHENTICATED_STATUSES', 'assertEnvelope'],
    'fixtures/read-catalog.ts': ['READ_CATALOG', 'placeholder', "auth?: 'required' | 'none'"],
    'fixtures/write-catalog.ts': ['WRITE_CATALOG', 'TEST_RECORD_PREFIX', 'downstream', 'revert'],
    'fixtures/project-exclusions.ts': ['PROJECT_EXCLUSIONS'],
    'scripts/api-guard.js': ['matchExclusion,', 'validateCatalogs,', 'duplicate id'],
    'package.json': ['"test:write"'],
    'global-setup.ts': ['QA_API_TOKEN', 'QA_USER_EMAIL', 'QA_USER_PASSWORD', 'api-session.json'],
    'playwright.config.ts': ["'**/write/**'"],
    'tests/security/read-only-guard.spec.ts': ['API-SEC-001', 'API-SEC-003'],
    'tests/security/catalogs.spec.ts': ['API-SEC-004', 'API-SEC-005'],
    'tests/security/no-session.spec.ts': ['API-SEC-010'],
    'tests/write/example-write-cycle.spec.ts': ['API-WR-001'],
  };
  const skill = skillFiles().map(read).join('\n');
  for (const [rel, identifiers] of Object.entries(sources)) {
    const text = read(path.join(SCAFFOLD, rel));
    for (const id of identifiers) {
      assert.ok(text.includes(id), `${rel} no longer contains ${id}, which the skill describes`);
    }
  }
  for (const id of ['pickOwnRecord', 'authenticatedClient', 'expectUnauthenticated', 'UNAUTHENTICATED_STATUSES',
    'assertEnvelope', 'READ_CATALOG', 'WRITE_CATALOG', 'TEST_RECORD_PREFIX', 'PROJECT_EXCLUSIONS',
    'matchExclusion', 'npm run test:write', 'QA_API_TOKEN', 'API-SEC-004']) {
    assert.ok(skill.includes(id), `the skill should describe ${id}`);
  }
});

test('qa-api-integration: the qa/00-standards documents it points to are installed by init', () => {
  const skill = skillFiles().map(read).join('\n');
  const STD_RE = /qa\/00-standards\/([a-z-]+\.md)/g;
  const named = new Set([...skill.matchAll(STD_RE)].map((m) => m[1]));
  for (const doc of ['write-safety-policy.md', 'api-testing-conventions.md']) {
    assert.ok(named.has(doc), `the skill should point to qa/00-standards/${doc}`);
  }
  const init = read(INIT_PATH);
  for (const doc of named) {
    if (doc === 'naming-conventions.md') continue; // project-owned, created by the project
    assert.ok(init.includes(`'${doc}'`), `init.js does not install qa/00-standards/${doc}`);
  }
});

test('qa-api-integration: the skill covers each topic of the work package', () => {
  const skill = skillFiles().map(read).join('\n');
  const topics = [
    [/Append it at the END of `READ_CATALOG`/, 'append at the end of the catalog'],
    [/stable id derived from the route|derive each id from the route/i, 'stable ids derived from the route'],
    [/HTTP 200 with the application's HTML page/, 'the 200-with-HTML trap'],
    [/misspellings\s+included/, 'envelope uses the API spelling'],
    [/test\.fail\(/, 'test.fail with an open defect'],
    [/server decides whether a session is valid, not the age of the file/, 'session validity decided by the server'],
    [/They are not skipped/, 'no silent skip without a session'],
    [/does not sync with external systems/, 'confirm no external sync before enabling a write'],
    [/Probe the minimal body with a new record/, 'probe the minimal body'],
    [/### 1\. Capture[\s\S]*### 2\. Classify[\s\S]*### 3\. Verify[\s\S]*### 4\. Generate/, 'the four discovery steps'],
    [/## Known limits/, 'discovery limits'],
    [/`API-\{GROUP\}-\{NNN\}`/, 'case id convention'],
  ];
  for (const [re, label] of topics) assert.match(skill, re, `missing topic: ${label}`);
});

test('qa-api-integration: the skill and the conventions template carry nothing of the source project', () => {
  // Names, envelope fields and vocabulary of the project the conventions were ported
  // from. The framework ships the method; those stay in that project.
  const SOURCE_TERMS = /sispro|agrosoft|unitec|isSucess|Vigency|gateway\/|catalogo|escritura|pantallas|account\/status|mdm\b|lane2/i;
  for (const file of authoredFiles()) {
    const hit = read(file).match(SOURCE_TERMS);
    assert.equal(hit, null, `${path.relative(REPO_ROOT, file)} contains "${hit && hit[0]}"`);
  }
});

test('qa-api-integration: skill and conventions template are UTF-8 without BOM and free of forbidden characters', () => {
  const findings = authoredFiles().flatMap((file) => {
    const raw = fs.readFileSync(file);
    assert.ok(!(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf), `${file} must not start with a BOM`);
    return scanText(raw.toString('utf8'), path.relative(REPO_ROOT, file));
  });
  assert.deepEqual(findings, []);
});

test('api-testing-conventions template refers to the skill and the policy instead of restating them', () => {
  const text = read(CONVENTIONS_TEMPLATE);
  assert.match(text, /qa-api-integration/);
  assert.match(text, /qa\/00-standards\/write-safety-policy\.md/);
  assert.match(text, /the policy wins/);
  // The four gates are the policy's: the template must not carry its own copy.
  assert.doesNotMatch(text, /gate 2|gate 3|gate 4/i);
});

// --- Lists of skills ---------------------------------------------------------------------

test('both rules templates list qa-api-integration in the pipeline table, as stage 5', () => {
  const instructions = read(path.join(REPO_ROOT, 'templates', 'qa-framework.instructions.md'));
  const rules = read(path.join(REPO_ROOT, 'templates', 'qa-framework.rules.md'));
  assert.match(instructions, /^\| 5 \| Generate API tests \| `\.github\/skills\/qa-api-integration\/SKILL\.md` \|/m);
  assert.match(rules, /^\| 5 \| Generate API tests \| `\/qa-api-integration` \|/m);
});

test('the generated command for qa-api-integration carries its prerequisite', () => {
  const content = buildCommandContent('qa-api-integration');
  assert.match(content, /`\.github\/skills\/qa-api-integration\/SKILL\.md`/);
  assert.match(content, /Prerequisite: Integration scaffold/);
});

test('every skill folder is named in README.md and in this repo\'s copilot instructions count', () => {
  const skills = fs.readdirSync(path.join(REPO_ROOT, 'skills'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name);
  const readme = read(path.join(REPO_ROOT, 'README.md'));
  for (const name of skills) assert.ok(readme.includes(`${name}/`), `README.md tree does not list ${name}`);
  const copilot = read(path.join(REPO_ROOT, '.github', 'copilot-instructions.md'));
  assert.match(copilot, new RegExp(`${skills.length} skills loaded on demand`));
  assert.match(copilot, new RegExp(`${skills.length} SKILL\\.md files`));
});

// --- init and upgrade --------------------------------------------------------------------

test('init: installs the API testing conventions in qa/00-standards/ from the template', () => {
  withProject((root) => {
    const result = run(INIT_PATH, root);
    assert.equal(result.status, 0, result.stderr);
    const installed = path.join(root, 'qa', '00-standards', 'api-testing-conventions.md');
    assert.equal(read(installed), read(CONVENTIONS_TEMPLATE));
    assert.ok(fs.existsSync(path.join(root, '.github', 'skills', 'qa-api-integration', 'SKILL.md')));
    assert.equal(
      read(path.join(root, '.claude', 'commands', 'qa-api-integration.md')),
      buildCommandContent('qa-api-integration'),
    );
  });
});

test('init: never overwrites project-edited API testing conventions', () => {
  withProject((root) => {
    assert.equal(run(INIT_PATH, root).status, 0);
    const installed = path.join(root, 'qa', '00-standards', 'api-testing-conventions.md');
    fs.writeFileSync(installed, '# Edited by the project\n', 'utf8');
    const result = run(INIT_PATH, root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(read(installed), '# Edited by the project\n');
  });
});

test('upgrade: delivers the skill and its command to a project that predates them', () => {
  withProject((root) => {
    assert.equal(run(INIT_PATH, root).status, 0);
    fs.rmSync(path.join(root, '.github', 'skills', 'qa-api-integration'), { recursive: true, force: true });
    fs.rmSync(path.join(root, '.claude', 'commands', 'qa-api-integration.md'), { force: true });
    const result = run(UPGRADE_PATH, root);
    assert.equal(result.status, 0, result.stderr);
    for (const file of skillFiles()) {
      const rel = path.relative(path.join(REPO_ROOT, 'skills'), file);
      assert.equal(read(path.join(root, '.github', 'skills', rel)), read(file), `${rel} not delivered`);
    }
    assert.equal(
      read(path.join(root, '.claude', 'commands', 'qa-api-integration.md')),
      buildCommandContent('qa-api-integration'),
    );
  });
});
