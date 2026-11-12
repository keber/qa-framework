'use strict';

// PR review rubric with escalation levels (survey item C13).
//
// The template ships in templates/pr-review-rubric.md. init installs it as
// qa/00-standards/pr-review-rubric.md only when missing (a STANDARDS_DOCS entry, so
// upgrade delivers it the same way) and neither command ever overwrites an existing
// copy: the project edits the rubric (it promotes, demotes and suspends criteria).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { scanText } = require('../scripts/check-forbidden-chars.js');
const { STANDARDS_DOCS } = require('../scripts/lib/standards-docs.js');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'templates', 'pr-review-rubric.md');
const INIT_PATH = path.join(ROOT, 'scripts', 'init.js');
const UPGRADE_PATH = path.join(ROOT, 'scripts', 'upgrade.js');
const GUIDE_PATH = path.join(ROOT, 'docs', 'folder-structure-guide.md');
const INSTALLED_REL = ['qa', '00-standards', 'pr-review-rubric.md'];

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-pr-rubric-'));
}

function readTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, 'utf8');
}

// A section ends at the next "## " heading outside a code fence: the report template in
// section 10 carries its own "##" headings inside a fence. Fenced blocks are blanked
// (same length) only to find the boundary; the returned slice keeps them.
function section(content, heading) {
  const start = content.indexOf(heading);
  assert.ok(start >= 0, `missing heading: ${heading}`);
  const unfenced = content.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
  const next = unfenced.indexOf('\n## ', start + heading.length);
  return content.slice(start, next < 0 ? undefined : next);
}

// --- Template content ---

test('pr-review-rubric template: exists, is UTF-8 without BOM and has no forbidden characters', () => {
  const raw = fs.readFileSync(TEMPLATE_PATH);
  assert.ok(raw.length > 0);
  assert.notDeepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.deepEqual(scanText(raw.toString('utf8'), 'templates/pr-review-rubric.md'), []);
});

test('pr-review-rubric template: the review unit is the work item, not the PR', () => {
  const unit = section(readTemplate(), '## 2. Review unit');
  assert.match(unit, /work item/i);
  assert.match(unit, /together/i);
});

test('pr-review-rubric template: defines the three escalation levels and their effect on the vote', () => {
  const levels = section(readTemplate(), '## 3. Escalation levels');
  for (const level of ['Blocking', 'Warning', 'Informational']) {
    assert.match(levels, new RegExp(`\\| \\*\\*${level}\\*\\* \\|`), `missing level row: ${level}`);
  }
  assert.match(levels, /Waiting for author/);
  assert.match(levels, /-5/);
  // Promotion happens by team agreement, not by the reviewer alone.
  assert.match(levels, /promot/i);
  assert.match(levels, /team agrees/i);
});

test('pr-review-rubric template: has one criteria table per level plus a suspended-criteria table with a reason', () => {
  const content = readTemplate();
  for (const heading of ['## 4. Blocking criteria', '## 5. Warning criteria', '## 6. Informational criteria']) {
    assert.match(section(content, heading), /\| Code \| Criterion \|/, `${heading} has no criteria table`);
  }
  const suspended = section(content, '## 7. Suspended criteria');
  assert.match(suspended, /\| Code \| Criterion \| Reason \|/);
  assert.match(suspended, /resume/i);
});

test('pr-review-rubric template: criteria carry citable codes', () => {
  const content = readTemplate();
  assert.match(section(content, '## 4. Blocking criteria'), /\| `PR-\d{2}` \|/);
  assert.match(section(content, '## 6. Informational criteria'), /\| `PR-I\d` \|/);
});

test('pr-review-rubric template: vote mapping and the closed-comment rule that would otherwise block the merge', () => {
  const votes = section(readTemplate(), '## 8. Vote and comments');
  for (const vote of ['10', '-5', '-10']) {
    assert.match(votes, new RegExp(`\\(\`${vote}\`\\)`), `missing vote ${vote}`);
  }
  assert.match(votes, /one comment per PR/i);
  assert.match(votes, /Closed|Resolved/);
  assert.match(votes, /blocks the merge/i);
  assert.match(votes, /latest/i);
});

test('pr-review-rubric template: report template separates the verdict from QA judgement and declares its limits', () => {
  const report = section(readTemplate(), '## 10. Review report template');
  assert.match(report, /pr-reviews\//);
  assert.match(report, /qa-framework clock/);
  assert.match(report, /Verdict by criterion/i);
  assert.match(report, /evidence/i);
  assert.match(report, /Observations for QA/);
  assert.match(report, /Limitations of this analysis/);
});

test('pr-review-rubric template: keeps a version history', () => {
  assert.match(readTemplate(), /^## Version history$/m);
});

test('pr-review-rubric template: contains no consumer-project specifics', () => {
  const content = readTemplate();
  const denylist = [
    /garc[eé]s/i, /biofruit/i, /enrolamiento/i, /sispro/i, /gmo/i, /exportadora/i,
    /nexus/i, /bioacsys/i, /\bgf-/, /qa-test/, /dacpac/i, /kardex/i, /maquila/i,
    /dev\.azure\.com/i, /https?:\/\//, /!\d{4,}/, /\b5\d{4}\b/,
  ];
  for (const pattern of denylist) {
    assert.doesNotMatch(content, pattern, `template leaks ${pattern}`);
  }
});

// --- Wiring ---

test('standards list: the rubric is a STANDARDS_DOCS entry backed by the template', () => {
  const entry = STANDARDS_DOCS.find((d) => d.file === 'pr-review-rubric.md');
  assert.ok(entry, 'pr-review-rubric.md missing from STANDARDS_DOCS');
  assert.equal(entry.template, 'pr-review-rubric.md');
});

test('folder-structure guide: lists pr-review-rubric.md under 00-standards', () => {
  const guide = fs.readFileSync(GUIDE_PATH, 'utf8');
  const standards = section(guide, '## 00-standards/');
  assert.match(standards, /\| `pr-review-rubric\.md` \|/);
});

// --- Installation ---

test('init: installs the rubric as qa/00-standards/pr-review-rubric.md', () => {
  const projectRoot = tmpProject();
  try {
    const result = run(INIT_PATH, [], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(projectRoot, ...INSTALLED_REL), 'utf8'), readTemplate());
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('init: leaves an existing, project-edited rubric untouched', () => {
  const projectRoot = tmpProject();
  try {
    const installed = path.join(projectRoot, ...INSTALLED_REL);
    fs.mkdirSync(path.dirname(installed), { recursive: true });
    fs.writeFileSync(installed, '# Rubric edited by the project\n', 'utf8');

    const result = run(INIT_PATH, [], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(installed, 'utf8'), '# Rubric edited by the project\n');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('upgrade: delivers the rubric when missing and never overwrites an edited copy', () => {
  const projectRoot = tmpProject();
  try {
    assert.equal(run(INIT_PATH, [], projectRoot).status, 0);
    const installed = path.join(projectRoot, ...INSTALLED_REL);

    // Project initialised before the rubric existed: upgrade creates it.
    fs.rmSync(installed);
    let result = run(UPGRADE_PATH, [], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(installed, 'utf8'), readTemplate());

    // Project-edited rubric: upgrade leaves it byte-identical.
    fs.writeFileSync(installed, '# Rubric edited by the project\n', 'utf8');
    result = run(UPGRADE_PATH, [], projectRoot);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(installed, 'utf8'), '# Rubric edited by the project\n');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
