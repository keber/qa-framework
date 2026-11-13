'use strict';

// WP5.3 - ownership of every force-written file (skills, commands, rules, instructions,
// QA structure guide). A file that matches a shipped version (or its own generated
// marker) is overwritten as before. Anything else is the project's edit: it is copied
// to a per-run backup folder that no agent loads, then overwritten, and a triage report
// lists the lines the project added relative to the version the file came from.
//
// The v1.12.0 copies under test/fixtures/ownership-v1.12.0/ are byte copies of what
// v1.12.0 wrote (git show v1.12.0:..., rendered as v1.12.0 rendered them). They are
// stored with flat names on purpose: a fixture tree containing .claude/rules/ would be
// loaded by Claude Code while working on this repository.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const UPGRADE_PATH = path.join(REPO_ROOT, 'scripts', 'upgrade.js');
const INIT_PATH = path.join(REPO_ROOT, 'scripts', 'init.js');
const FIXTURES = path.join(__dirname, 'fixtures', 'ownership-v1.12.0');
const VERSION = require('../package.json').version;
const { buildCommandContent, discoverSkillNames } = require('../scripts/lib/claude-commands');
const ownership = require('../scripts/lib/ownership');
const { publishedFiles } = require('./helpers/published-files');

const BACKUP_ROOT = ['.claude', 'qa-framework-backup'];
const RUN_DIR = `upgrade-to-${VERSION}`;
const cp = (n) => String.fromCodePoint(n);
const BOM = cp(0xfeff);

// key (project-relative path) -> fixture file holding the v1.12.0 content.
const OLD = {
  '.claude/rules/qa-framework.md': 'rules.md',
  '.github/instructions/qa-framework.instructions.md': 'instructions.md',
  '.claude/commands/qa-automation.md': 'command-qa-automation.md',
  '.github/skills/qa-maintenance/references/update-rules.md': 'skill-qa-maintenance-update-rules.md',
  'qa/QA-STRUCTURE-GUIDE.md': 'guide.md',
};

function run(script, cwd, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}
const upgrade = (cwd, args) => run(UPGRADE_PATH, cwd, args);

function tmpProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-ownership-'));
  fs.mkdirSync(path.join(root, 'qa'), { recursive: true });
  return root;
}

const abs = (root, key) => path.join(root, ...key.split('/'));
const read = (file) => fs.readFileSync(file, 'utf8');
const oldContent = (key) => read(path.join(FIXTURES, OLD[key]));

function put(root, key, content) {
  fs.mkdirSync(path.dirname(abs(root, key)), { recursive: true });
  fs.writeFileSync(abs(root, key), content);
}

/** What this release writes at `key`. */
function currentContent(key) {
  if (key === '.claude/rules/qa-framework.md') {
    return read(path.join(REPO_ROOT, 'templates', 'qa-framework.rules.md')).replace('{{VERSION}}', VERSION);
  }
  if (key === '.github/instructions/qa-framework.instructions.md') {
    return read(path.join(REPO_ROOT, 'templates', 'qa-framework.instructions.md')).replace('{{VERSION}}', VERSION);
  }
  if (key === 'qa/QA-STRUCTURE-GUIDE.md') return read(path.join(REPO_ROOT, 'docs', 'folder-structure-guide.md'));
  if (key.startsWith('.claude/commands/')) return buildCommandContent(path.basename(key, '.md'));
  if (key.startsWith('.github/skills/')) return read(path.join(REPO_ROOT, 'skills', ...key.split('/').slice(2)));
  throw new Error(`unknown key ${key}`);
}

const backupRoot = (root) => path.join(root, ...BACKUP_ROOT);
const runDir = (root, name = RUN_DIR) => path.join(backupRoot(root), name);

/** Every file under dir as relpath (posix) -> sha256 of the raw bytes. */
function snapshot(dir) {
  const out = {};
  (function walk(d) {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[path.relative(dir, full).split(path.sep).join('/')] =
        crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  })(dir);
  return out;
}

function withProject(fn) {
  const root = tmpProject();
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** Added-line hunks of one file in the triage report, as arrays of verbatim lines. */
function reportedLines(report, key) {
  const start = report.indexOf(`\n## ${key}\n`);
  assert.notEqual(start, -1, `report has no section for ${key}:\n${report}`);
  // The next file section; a "## " line inside a fenced block is project content.
  const heading = /\n## (?:\.claude|\.github|qa)\//g;
  heading.lastIndex = start + 4;
  const next = heading.exec(report);
  const section = report.slice(start, next ? next.index : undefined);
  const lines = [];
  const fence = /^(`{3,})text\n([\s\S]*?)\n\1$/gm;
  let m;
  while ((m = fence.exec(section))) lines.push(...m[2].split('\n'));
  return { section, lines };
}

// --- manifest invariants ----------------------------------------------------

test('invariant: every current force-written file is registered in the ownership manifest', () => {
  const manifest = ownership.loadManifest();
  assert.ok(manifest, 'scripts/lib/ownership-manifest.json is missing or unreadable');
  const files = ownership.currentOwnedFiles(REPO_ROOT);
  const keys = files.map((f) => f.key);
  for (const required of Object.keys(OLD)) assert.ok(keys.includes(required), `${required} not enumerated`);
  for (const name of discoverSkillNames(path.join(REPO_ROOT, 'skills'))) {
    assert.ok(keys.includes(`.claude/commands/${name}.md`), `command for ${name} not enumerated`);
  }
  const stale = files.filter((f) => {
    const entry = manifest.files[f.key];
    return !entry || entry.current !== ownership.fileHash(f.base) ||
      !entry.versions.some((v) => v.hash === entry.current);
  }).map((f) => f.key);
  assert.deepEqual(stale, [],
    'These files changed (or are new) and are not registered in scripts/lib/ownership-manifest.json.\n' +
    'Regenerate it from a full clone with tags: npm run build:ownership-manifest');
});

test('invariant: the manifest knows the v1.12.0 fixtures, so they are recognised as pristine', () => {
  const manifest = ownership.loadManifest();
  for (const [key, fixture] of Object.entries(OLD)) {
    const content = read(path.join(FIXTURES, fixture));
    assert.equal(ownership.classify(manifest, key, content, currentContent(key)).state, 'pristine', key);
  }
});

test('manifest: line sequences decode to exactly the shipped content of every version', () => {
  const manifest = ownership.loadManifest();
  for (const f of ownership.currentOwnedFiles(REPO_ROOT)) {
    const versions = ownership.versionLines(manifest, f.key, f.base);
    const current = versions.find((v) => v.hash === manifest.files[f.key].current);
    assert.deepEqual(current.lines, ownership.lineHashes(f.base), f.key);
  }
  const rules = ownership.versionLines(manifest, '.claude/rules/qa-framework.md',
    ownership.currentOwnedFiles(REPO_ROOT).find((f) => f.key === '.claude/rules/qa-framework.md').base);
  const v1120 = rules.find((v) => v.tags.includes('1.12.0'));
  assert.ok(v1120, 'rules: no version shipped in 1.12.0');
  assert.deepEqual(v1120.lines,
    ownership.lineHashes(ownership.normalizeFor('.claude/rules/qa-framework.md', oldContent('.claude/rules/qa-framework.md'))));
});

test('manifest: the generator needs git, so it is not published; the manifest is', () => {
  const published = publishedFiles();
  assert.ok(published.includes('scripts/lib/ownership-manifest.json'));
  assert.ok(!published.includes('scripts/build-ownership-manifest.js'));
});

// --- pristine ---------------------------------------------------------------

test('pristine: a v1.12.0 file of each kind is overwritten without any backup', () => withProject((root) => {
  for (const key of Object.keys(OLD)) put(root, key, oldContent(key));
  const result = upgrade(root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const key of Object.keys(OLD)) assert.equal(read(abs(root, key)), currentContent(key), key);
  assert.equal(fs.existsSync(backupRoot(root)), false, 'no backup expected for pristine files');
  assert.doesNotMatch(result.stdout, /qa-framework-backup/);
}));

test('pristine: a CRLF copy of a shipped version still counts as pristine', () => withProject((root) => {
  const key = '.claude/rules/qa-framework.md';
  put(root, key, BOM + oldContent(key).replace(/\r?\n/g, '\r\n'));
  assert.equal(upgrade(root).status, 0);
  assert.equal(read(abs(root, key)), currentContent(key));
  assert.equal(fs.existsSync(backupRoot(root)), false);
}));

test('pristine: a generated command whose marker matches its body is overwritten without backup', () => withProject((root) => {
  const key = '.claude/commands/qa-automation.md';
  const body = 'Read an older generated wrapper.\n';
  put(root, key, ownership.stampGenerated(body));
  assert.equal(upgrade(root).status, 0);
  assert.equal(read(abs(root, key)), currentContent(key));
  assert.equal(fs.existsSync(backupRoot(root)), false);
}));

test('commands: generated commands carry an ownership marker that matches their body', () => withProject((root) => {
  assert.equal(run(INIT_PATH, root).status, 0);
  const text = read(abs(root, '.claude/commands/qa-automation.md'));
  const match = text.match(/\n<!-- qa-framework:generated sha256=([0-9a-f]{64}) -->\n$/);
  assert.ok(match, text);
  assert.equal(match[1], crypto.createHash('sha256').update(text.slice(0, match.index)).digest('hex'));
  assert.ok(text.startsWith('Read the full skill at `.github/skills/qa-automation/SKILL.md` FIRST'));
}));

// --- edited -----------------------------------------------------------------

test('edited: each kind is backed up byte for byte, overwritten, and warned with its backup path', () => withProject((root) => {
  const edited = {};
  for (const key of Object.keys(OLD)) {
    edited[key] = oldContent(key) + '\nProject line for ' + key + '\n';
    put(root, key, edited[key]);
  }
  const result = upgrade(root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const key of Object.keys(OLD)) {
    assert.equal(read(abs(root, key)), currentContent(key), `${key} must be overwritten`);
    const backup = path.join(runDir(root), ...ownership.backupRelPath(key).split('/'));
    assert.equal(read(backup), edited[key], `${key}: backup must hold the exact edited bytes`);
    const shown = ['.claude', 'qa-framework-backup', RUN_DIR, ...ownership.backupRelPath(key).split('/')];
    assert.match(result.stdout, new RegExp(shown.map((s) => s.replace(/[.+-]/g, '\\$&')).join('[\\\\/]')), key);
  }
  assert.match(result.stdout, /TRIAGE\.md/);
}));

test('edited: a hand-written command (no marker, matches no shipped version) is backed up, then regenerated', () => withProject((root) => {
  const key = '.claude/commands/qa-automation.md';
  const handWritten = '# My own automation command\n\nRun the suite with my flags.\n';
  put(root, key, handWritten);
  const result = upgrade(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read(abs(root, key)), currentContent(key));
  assert.equal(read(path.join(runDir(root), 'claude', 'commands', 'qa-automation.md')), handWritten);
  assert.match(result.stdout, /hand-written|edited/);
}));

test('edited: a generated command edited after generation (marker mismatch) is backed up', () => withProject((root) => {
  const key = '.claude/commands/qa-automation.md';
  const stamped = currentContent(key);
  const edited = stamped.replace('FIRST,', 'FIRST (and our checklist),');
  put(root, key, edited);
  assert.equal(upgrade(root).status, 0);
  assert.equal(read(abs(root, key)), stamped);
  assert.equal(read(path.join(runDir(root), 'claude', 'commands', 'qa-automation.md')), edited);
}));

test('edited: an earlier backup is never overwritten; each run gets its own folder', () => withProject((root) => {
  const key = '.claude/rules/qa-framework.md';
  // A folder with this run's name already exists (an earlier run), with a file at the same path.
  const earlier = path.join(runDir(root), 'claude', 'rules', 'qa-framework.md');
  fs.mkdirSync(path.dirname(earlier), { recursive: true });
  fs.writeFileSync(earlier, 'earlier backup\n');

  put(root, key, oldContent(key) + 'first edit\n');
  assert.equal(upgrade(root).status, 0);
  put(root, key, currentContent(key) + 'second edit\n');
  assert.equal(upgrade(root).status, 0);

  assert.equal(read(earlier), 'earlier backup\n');
  const runs = fs.readdirSync(backupRoot(root)).sort();
  assert.deepEqual(runs, [RUN_DIR, `${RUN_DIR}-run2`, `${RUN_DIR}-run3`]);
  assert.equal(read(path.join(runDir(root, `${RUN_DIR}-run2`), 'claude', 'rules', 'qa-framework.md')), oldContent(key) + 'first edit\n');
  assert.equal(read(path.join(runDir(root, `${RUN_DIR}-run3`), 'claude', 'rules', 'qa-framework.md')), currentContent(key) + 'second edit\n');
}));

test('second run: zero bytes changed and no new backup', () => withProject((root) => {
  for (const key of Object.keys(OLD)) put(root, key, oldContent(key) + 'edit\n');
  assert.equal(upgrade(root).status, 0);
  const before = snapshot(root);
  const second = upgrade(root);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(snapshot(root), before);
  assert.doesNotMatch(second.stdout, /qa-framework-backup/);
}));

test('dry run: reports the backup it would make, writes nothing', () => withProject((root) => {
  const key = '.claude/rules/qa-framework.md';
  put(root, key, oldContent(key) + 'edit\n');
  const before = snapshot(root);
  const result = upgrade(root, ['--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(snapshot(root), before);
  assert.match(result.stdout, /would be saved to/);
}));

test('backups never land in a folder an agent loads', () => withProject((root) => {
  fs.writeFileSync(path.join(root, 'qa-framework.config.json'), JSON.stringify({
    project: { name: 'demo' },
    integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
  }));
  for (const key of Object.keys(OLD)) put(root, key, oldContent(key) + 'edit\n');
  put(root, '.claude/agents/qa-plan.md', '---\nname: qa-plan\n---\nhand-written agent\n');
  assert.equal(upgrade(root).status, 0);

  const scanned = [
    '.claude/agents/', '.claude/commands/', '.claude/rules/', '.claude/skills/',
    '.github/instructions/', '.github/skills/', '.github/agents/', '.github/prompts/', '.github/chatmodes/',
  ];
  const all = Object.keys(snapshot(root));
  const backups = all.filter((p) => p.startsWith('.claude/qa-framework-backup/'));
  assert.equal(backups.length, Object.keys(OLD).length + 2, backups.join('\n')); // + agent + TRIAGE.md
  for (const p of backups) {
    assert.ok(!scanned.some((dir) => p.startsWith(dir)), p);
    // No nested .claude/ or .github/ either: some tools discover those in subfolders too.
    assert.ok(!p.split('/').slice(2).some((seg) => seg === '.claude' || seg === '.github'), p);
  }
  // The rc.6 agent backup now goes to the same run folder, keeping its relative path.
  assert.equal(read(path.join(runDir(root), 'claude', 'agents', 'qa-plan.md')), '---\nname: qa-plan\n---\nhand-written agent\n');
}));

test('agents: backups made by rc.6 stay where they are', () => withProject((root) => {
  fs.writeFileSync(path.join(root, 'qa-framework.config.json'), JSON.stringify({
    project: { name: 'demo' },
    integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
  }));
  const old = path.join(backupRoot(root), 'agents', 'qa-plan.20261112-101010.md');
  fs.mkdirSync(path.dirname(old), { recursive: true });
  fs.writeFileSync(old, 'rc.6 backup\n');
  assert.equal(upgrade(root).status, 0);
  assert.equal(read(old), 'rc.6 backup\n');
}));

// --- triage report ----------------------------------------------------------

test('triage: lists exactly the lines the project added, relative to the version it came from', () => withProject((root) => {
  const key = '.claude/rules/qa-framework.md';
  const lines = oldContent(key).split('\n');
  const inserted = ['12. **Project rule** - always use the staging tenant.', '13. Second project rule.'];
  const appended = ['## Project notes', '', 'Ask Marta before touching the ADO board.'];
  const at = lines.findIndex((l) => l.startsWith('## ')) + 1;
  const edited = [...lines.slice(0, at), ...inserted, ...lines.slice(at, -1), ...appended, ''].join('\n');
  put(root, key, edited);

  const skillKey = '.github/skills/qa-maintenance/references/update-rules.md';
  put(root, skillKey, oldContent(skillKey).replace('\n', '\nProject-specific maintenance step.\n'));

  const result = upgrade(root);
  assert.equal(result.status, 0, result.stderr);
  const report = read(path.join(runDir(root), 'TRIAGE.md'));

  const rules = reportedLines(report, key);
  assert.deepEqual(rules.lines, [...inserted, ...appended]);
  assert.match(rules.section, /Compared with: 1\.12\.0\b/);
  assert.doesNotMatch(rules.section, /approximate/i);

  const skill = reportedLines(report, skillKey);
  assert.deepEqual(skill.lines, ['Project-specific maintenance step.']);
  assert.match(skill.section, /Compared with: [^\n]*1\.12\.0/);
}));

test('triage: a hand-written command lists every line, and the report is ASCII-safe', () => withProject((root) => {
  const key = '.claude/commands/qa-automation.md';
  put(root, key, `Run it ${cp(0x2014)} now${cp(0x2026)} ${cp(0x2192)} then ${cp(0x201c)}done${cp(0x201d)}. Revisi${cp(0xf3)}n ${cp(0x2705)}\n`);
  assert.equal(upgrade(root).status, 0);
  const report = read(path.join(runDir(root), 'TRIAGE.md'));
  const { lines } = reportedLines(report, key);
  assert.deepEqual(lines, [`Run it <U+2014> now<U+2026> <U+2192> then <U+201C>done<U+201D>. Revisi${cp(0xf3)}n <U+2705>`]);
  // Only ASCII plus Latin-1 / Latin Extended (accents are allowed by the formatting rules).
  assert.doesNotMatch(report, new RegExp(`[^\\t\\n\\x20-\\x7E${cp(0xa0)}-${cp(0x24f)}]`));
  assert.ok(!report.startsWith(BOM));
}));

test('triage: the report is written only when something was backed up', () => withProject((root) => {
  for (const key of Object.keys(OLD)) put(root, key, oldContent(key));
  assert.equal(upgrade(root).status, 0);
  assert.equal(fs.existsSync(path.join(runDir(root), 'TRIAGE.md')), false);
}));
