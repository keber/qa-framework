'use strict';

// B3 - the fourth defect category. qa/06-defects/ has four folders: open/, disputed/,
// resolved/ and recommendations/ (findings that violate no business rule). Every place
// the framework enumerates the defect folders must list the four, init must create them,
// and upgrade must add the new one to existing projects without touching anything else.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const INIT_PATH = path.join(REPO_ROOT, 'scripts', 'init.js');
const UPGRADE_PATH = path.join(REPO_ROOT, 'scripts', 'upgrade.js');

const {
  DEFECT_CATEGORIES,
  RECOMMENDATIONS_README,
  LEGACY_RECOMMENDATION_FOLDERS,
} = require('../scripts/lib/defect-categories');

function run(script, args, cwd) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-defcat-'));
}

function initProject() {
  const root = tmpProject();
  const result = run(INIT_PATH, [], root);
  assert.equal(result.status, 0, result.stderr);
  return root;
}

const defectsDir = (root) => path.join(root, 'qa', '06-defects');

function snapshot(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        out[path.relative(dir, full)] = crypto
          .createHash('sha256')
          .update(fs.readFileSync(full))
          .digest('hex');
      }
    }
  })(dir);
  return out;
}

test('defect categories: the four folders, in lifecycle order', () => {
  assert.deepEqual(DEFECT_CATEGORIES, ['open', 'disputed', 'resolved', 'recommendations']);
});

test('defect categories: the recommendations README states what belongs there and its id', () => {
  assert.match(RECOMMENDATIONS_README, /^# 06-defects\/recommendations\//);
  assert.match(RECOMMENDATIONS_README, /no business rule/i);
  assert.match(RECOMMENDATIONS_README, /REC-\{PREFIX\}-NNN/);
  assert.match(RECOMMENDATIONS_README, /test\.fail\(\)/);
  assert.match(RECOMMENDATIONS_README, /open\//);
});

test('init: creates the four defect folders and the recommendations README', () => {
  const root = initProject();
  try {
    for (const category of DEFECT_CATEGORIES) {
      assert.ok(
        fs.statSync(path.join(defectsDir(root), category)).isDirectory(),
        `missing 06-defects/${category}/`
      );
    }
    const readme = path.join(defectsDir(root), 'recommendations', 'README.md');
    assert.equal(fs.readFileSync(readme, 'utf8'), RECOMMENDATIONS_README);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: adds recommendations/ to an existing project and touches nothing else', () => {
  const root = initProject();
  try {
    const recDir = path.join(defectsDir(root), 'recommendations');
    fs.rmSync(recDir, { recursive: true, force: true });
    fs.writeFileSync(path.join(defectsDir(root), 'open', 'DEF-X-001_user.md'), '# user file\n');
    const before = snapshot(defectsDir(root));

    const result = run(UPGRADE_PATH, [], root);
    assert.equal(result.status, 0, result.stderr);

    assert.equal(fs.readFileSync(path.join(recDir, 'README.md'), 'utf8'), RECOMMENDATIONS_README);
    const after = snapshot(defectsDir(root));
    for (const [rel, hash] of Object.entries(before)) {
      assert.equal(after[rel], hash, `user file changed: ${rel}`);
    }
    assert.match(result.stdout, /\[created\] 06-defects\/recommendations\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: never overwrites an existing recommendations README', () => {
  const root = initProject();
  try {
    const readme = path.join(defectsDir(root), 'recommendations', 'README.md');
    fs.writeFileSync(readme, '# project wording\n');
    const result = run(UPGRADE_PATH, [], root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(readme, 'utf8'), '# project wording\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: restores a missing README inside an existing recommendations/ folder', () => {
  const root = initProject();
  try {
    const recDir = path.join(defectsDir(root), 'recommendations');
    fs.rmSync(path.join(recDir, 'README.md'));
    fs.writeFileSync(path.join(recDir, 'REC-X-001_user.md'), '# user rec\n');
    const result = run(UPGRADE_PATH, [], root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(path.join(recDir, 'README.md'), 'utf8'), RECOMMENDATIONS_README);
    assert.equal(fs.readFileSync(path.join(recDir, 'REC-X-001_user.md'), 'utf8'), '# user rec\n');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade: a project that already keeps improvements/ gets no second folder', () => {
  assert.ok(LEGACY_RECOMMENDATION_FOLDERS.includes('improvements'));
  const root = initProject();
  try {
    fs.rmSync(path.join(defectsDir(root), 'recommendations'), { recursive: true, force: true });
    const improvements = path.join(defectsDir(root), 'improvements');
    fs.mkdirSync(improvements);
    fs.writeFileSync(path.join(improvements, 'README.md'), '# local improvements\n');
    const before = snapshot(defectsDir(root));

    const result = run(UPGRADE_PATH, [], root);
    assert.equal(result.status, 0, result.stderr);

    assert.equal(fs.existsSync(path.join(defectsDir(root), 'recommendations')), false);
    assert.deepEqual(snapshot(defectsDir(root)), before);
    assert.match(result.stdout, /06-defects\/improvements\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade --dry-run: reports recommendations/ but creates nothing', () => {
  const root = initProject();
  try {
    const recDir = path.join(defectsDir(root), 'recommendations');
    fs.rmSync(recDir, { recursive: true, force: true });
    const result = run(UPGRADE_PATH, ['--dry-run'], root);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(recDir), false);
    assert.match(result.stdout, /06-defects\/recommendations\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- Every enumeration lists the four categories -------------------------------------

/** Shipped text files that can enumerate the defect folders. */
function enumerationCandidates() {
  const roots = ['skills', 'templates', 'docs', 'scripts'];
  const internalDocs = new Set([
    path.join('docs', 'upstream-candidates.md'),
    path.join('docs', 'autonomous-release-plan.md'),
    path.join('docs', 'review-wave2.md'),
  ]);
  const files = ['README.md'];
  for (const r of roots) {
    (function walk(rel) {
      const full = path.join(REPO_ROOT, rel);
      for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
        const childRel = path.join(rel, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || childRel === path.join('docs', 'proposals')) continue;
          walk(childRel);
        } else if (/\.(md|js|ts)$/.test(entry.name) && !internalDocs.has(childRel)) {
          files.push(childRel);
        }
      }
    })(r);
  }
  return files;
}

test('every file that enumerates the defect folders lists all four', () => {
  const offenders = [];
  for (const rel of enumerationCandidates()) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    // A list of folders: disputed plus at least one sibling on the same line or file.
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      const listsFolders =
        /06-defects\/open\|/.test(line) ||
        (/\bdisputed\/?`?/.test(line) && /\bresolved\/?`?/.test(line) && /\bopen\/?`?/.test(line));
      if (listsFolders && !/recommendations/.test(line)) {
        offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `enumerations with three or fewer categories:\n${offenders.join('\n')}`);
});

test('the folder-structure guide documents recommendations/ in the tree and the legend', () => {
  const guide = fs.readFileSync(path.join(REPO_ROOT, 'docs', 'folder-structure-guide.md'), 'utf8');
  assert.match(guide, /recommendations\//);
  assert.match(guide, /- `recommendations\/` - /);
});

test('rule 8 in both instruction templates sends non-defect findings to recommendations/', () => {
  for (const rel of ['templates/qa-framework.instructions.md', 'templates/qa-framework.rules.md']) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    const rule8 = text.split(/\r?\n/).find((l) => /^8\. \*\*Sprint\/module completion criteria/.test(l));
    assert.ok(rule8, `${rel}: rule 8 not found`);
    assert.match(rule8, /qa\/06-defects\/recommendations\//, `${rel}: rule 8`);
  }
});

test('the defect-handling skills and templates name the recommendations category', () => {
  const required = [
    'skills/qa-automation/SKILL.md',
    'skills/qa-automation/references/defect-polarity.md',
    'skills/qa-maintenance/references/update-rules.md',
    'skills/qa-test-cases/SKILL.md',
    'skills/qa-test-stabilization/SKILL.md',
    'templates/defect-report.md',
    'templates/AGENTS.md',
    'templates/agents/qa-reporte-ejecucion.md',
  ];
  for (const rel of required) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.match(text, /06-defects\/recommendations\//, rel);
  }
});
