'use strict';

// WP5.1 - content of the two agent rule files (templates/qa-framework.rules.md for
// Claude Code, templates/qa-framework.instructions.md for Copilot):
//   - rule 13: ADO work item full-content read (BLOCKING), pointing at the shipped
//     protocol reference;
//   - rule 14: PowerShell authorization, copied verbatim into sub-agent prompts;
//   - rule 8 renders the real defect prefix from conventions.defectIdPattern, with the
//     old generic text as the fallback, and a file rendered with a prefix is still
//     recognised as a shipped (pristine) version by upgrade;
//   - a header saying the file is framework-owned and where project rules go.
// New rules are appended: skills and agent templates cite rules by number.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { scanText } = require('../scripts/check-forbidden-chars.js');
const ownership = require('../scripts/lib/ownership');
const rulesTemplate = require('../scripts/lib/rules-template');

const REPO_ROOT = path.join(__dirname, '..');
const INIT_PATH = path.join(REPO_ROOT, 'scripts', 'init.js');
const UPGRADE_PATH = path.join(REPO_ROOT, 'scripts', 'upgrade.js');
const VERSION = require('../package.json').version;

const TEMPLATES = {
  '.claude/rules/qa-framework.md': 'templates/qa-framework.rules.md',
  '.github/instructions/qa-framework.instructions.md': 'templates/qa-framework.instructions.md',
};
const PROTOCOL = 'skills/qa-ado-integration/references/ado-workitem-full-read-protocol.md';
const PROTOCOL_CONSUMER_PATH = '.github/skills/qa-ado-integration/references/ado-workitem-full-read-protocol.md';

const read = (p) => fs.readFileSync(p, 'utf8');
const template = (rel) => read(path.join(REPO_ROOT, rel));

/** Numbered top-level rules of the "## Agent behavior rules" section: { number -> text }. */
function agentRules(content) {
  const start = content.indexOf('## Agent behavior rules');
  assert.notEqual(start, -1, 'missing "## Agent behavior rules" section');
  const rest = content.slice(start + 1);
  const end = rest.indexOf('\n## ');
  const body = end === -1 ? rest : rest.slice(0, end);
  const rules = {};
  for (const line of body.split(/\r?\n/)) {
    const m = /^(\d+)\. (.*)$/.exec(line);
    if (m) rules[Number(m[1])] = m[2];
  }
  return rules;
}

function run(script, cwd, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}

function withProject(config, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-rules-'));
  try {
    fs.mkdirSync(path.join(root, 'qa'), { recursive: true });
    if (config) fs.writeFileSync(path.join(root, 'qa-framework.config.json'), JSON.stringify(config, null, 2));
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const abs = (root, key) => path.join(root, ...key.split('/'));
const configWith = (defectIdPattern) => ({
  project: { name: 'demo' },
  conventions: { language: 'en', defectIdPattern },
});

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

// --- rule 13: ADO work item full-content read -----------------------------------

test('rule 13 is the BLOCKING ADO full-content read and points at the shipped protocol', () => {
  assert.ok(fs.existsSync(path.join(REPO_ROOT, PROTOCOL)), `${PROTOCOL} is not shipped`);
  for (const rel of Object.values(TEMPLATES)) {
    const rule = agentRules(template(rel))[13];
    assert.ok(rule, `${rel}: no rule 13`);
    assert.match(rule, /^\*\*ADO work item full-content read \(BLOCKING\):\*\*/, `${rel}: rule 13 title`);
    assert.ok(rule.includes(`\`${PROTOCOL_CONSUMER_PATH}\``), `${rel}: rule 13 must name the protocol at its installed path`);
    for (const required of [/Reason/, /Description/, /Acceptance Criteria/, /Repro Steps/, /image/,
      /comment/, /parent/, /child/, /provisional/, /sub-agent/]) {
      assert.match(rule, required, `${rel}: rule 13 must cover ${required}`);
    }
  }
});

// --- rule 14: PowerShell authorization ---------------------------------------------

test('rule 14 authorizes PowerShell only when the project does, and carries it verbatim to sub-agents', () => {
  for (const rel of Object.values(TEMPLATES)) {
    const rule = agentRules(template(rel))[14];
    assert.ok(rule, `${rel}: no rule 14`);
    assert.match(rule, /^\*\*PowerShell authorization/, `${rel}: rule 14 title`);
    assert.match(rule, /When the project authorizes PowerShell/, `${rel}: rule 14 must be conditional`);
    assert.match(rule, /verbatim/, `${rel}: rule 14 must require a verbatim copy`);
    assert.match(rule, /sub-agent prompt/, `${rel}: rule 14 must name the sub-agent prompt`);
    assert.match(rule, /grants nothing/, `${rel}: rule 14 must not authorize PowerShell by itself`);
  }
});

test('rules 13 and 14 are identical in both files, and the old rules keep their numbers', () => {
  const rules = agentRules(template(TEMPLATES['.claude/rules/qa-framework.md']));
  const instr = agentRules(template(TEMPLATES['.github/instructions/qa-framework.instructions.md']));
  for (const n of [13, 14]) assert.equal(rules[n], instr[n], `rule ${n} differs`);
  assert.deepEqual(Object.keys(rules).map(Number), [...Array(15).keys()]);
  assert.match(rules[8], /^\*\*Sprint\/module completion criteria:\*\*/);
  assert.match(rules[10], /^\*\*Assertion polarity rule/);
  assert.match(rules[11], /^\*\*Character encoding safety/);
  assert.match(rules[12], /^\*\*Lane lock/);
});

// --- header -----------------------------------------------------------------------

test('both files say they are framework-owned and where project rules go', () => {
  for (const rel of Object.values(TEMPLATES)) {
    const content = template(rel);
    const head = content.slice(0, content.indexOf('## Agent behavior rules'));
    assert.match(head, /framework-owned/i, `${rel}: header`);
    assert.match(head, /overwrit/i, `${rel}: header must say upgrade overwrites it`);
    assert.ok(head.includes(`\`${ownership.BACKUP_ROOT}/\``), `${rel}: header must name the backup folder`);
    assert.ok(head.includes('`.claude/rules/<project>.md`'), `${rel}: header`);
    assert.ok(head.includes('`.github/instructions/<project>.instructions.md`'), `${rel}: header`);
  }
});

// --- rule 8: defect prefix from conventions.defectIdPattern -----------------------

test('defect prefix: parsed from the patterns the config supports', () => {
  const cases = {
    'DEF-SIS-NNN': 'SIS',
    'DEF-SIS-{NUM}': 'SIS',
    'DEF-ABC-{NNN}': 'ABC',
    'DEF-ABC-{{NNN}}': 'ABC',
    'DEF-XXX-NNN': 'XXX',
    'DEF-{MODULE}-{NNN}': '{MODULE}',
    'DEF-{PREFIX}-{NUM}': '{PREFIX}',
    'DEF-AB-{MODULE}-{NUM}': 'AB-{MODULE}',
    'DEF-{NUM}': '',
    'DEF-NNN': '',
    ' DEF-SIS-{NUM} ': 'SIS',
  };
  for (const [pattern, prefix] of Object.entries(cases)) {
    assert.equal(rulesTemplate.defectPrefixFromPattern(pattern), prefix, pattern);
  }
});

test('defect prefix: a missing or unparseable pattern yields null', () => {
  for (const pattern of [undefined, null, '', 42, {}, 'BUG-{NUM}', 'def-sis-{NUM}', 'DEF-SIS',
    'DEF-SIS-{NUM', 'DEF-{{X}}-{NUM}', 'DEF-<b>-{NUM}', 'DEF-A B-{NUM}', 'DEF--{NUM}', 'DEF-SIS-{NUM}-x']) {
    assert.equal(rulesTemplate.defectPrefixFromPattern(pattern), null, String(pattern));
  }
});

test('render: rule 8 carries the project prefix in both files', () => {
  for (const rel of Object.values(TEMPLATES)) {
    const out = rulesTemplate.renderRulesTemplate(template(rel), VERSION, configWith('DEF-SIS-NNN'));
    const rule8 = agentRules(out)[8];
    assert.ok(rule8.includes('`qa/06-defects/open/DEF-SIS-NNN_*.md`'), `${rel}: ${rule8}`);
    assert.ok(rule8.includes('`REC-SIS-NNN`'), `${rel}: recommendation id`);
    assert.doesNotMatch(out, /\{PREFIX\}|\{\{[A-Z_]+\}\}/, `${rel}: placeholder left`);
    assert.ok(out.includes(`\`@keber/qa-framework\` v${VERSION}`), `${rel}: version`);
  }
});

test('render: a pattern with no prefix renders DEF-NNN; a missing or bad one keeps the generic text', () => {
  const rel = TEMPLATES['.claude/rules/qa-framework.md'];
  const none = agentRules(rulesTemplate.renderRulesTemplate(template(rel), VERSION, configWith('DEF-{NUM}')))[8];
  assert.ok(none.includes('`qa/06-defects/open/DEF-NNN_*.md`') && none.includes('`REC-NNN`'), none);
  for (const config of [{}, undefined, configWith('BUG-{NUM}'), { conventions: { defectIdPattern: 7 } }]) {
    const out = rulesTemplate.renderRulesTemplate(template(rel), VERSION, config);
    const rule8 = agentRules(out)[8];
    assert.ok(rule8.includes('`qa/06-defects/open/DEF-{PREFIX}-NNN_*.md`'), JSON.stringify(config));
    assert.ok(rule8.includes('`REC-{PREFIX}-NNN`'), JSON.stringify(config));
    assert.doesNotMatch(out, /\{\{[A-Z_]+\}\}/);
  }
});

test('normalization: the rendered prefix of this project goes back to the placeholder', () => {
  for (const [key, rel] of Object.entries(TEMPLATES)) {
    const raw = template(rel);
    const base = ownership.normalizeFor(key, raw);
    const ctx = rulesTemplate.renderContext(configWith('DEF-SIS-{NUM}'));
    const rendered = rulesTemplate.renderRulesTemplate(raw, '0.0.1-test', configWith('DEF-SIS-{NUM}'));
    assert.equal(ownership.normalizeFor(key, rendered, ctx), base, key);
    // The fallback text is always the placeholder, whatever the config says now.
    const generic = rulesTemplate.renderRulesTemplate(raw, '0.0.1-test', {});
    assert.equal(ownership.normalizeFor(key, generic), base, key);
    assert.equal(ownership.normalizeFor(key, generic, ctx), base, key);
    // Without the project's context a prefix is content: another prefix stays visible.
    assert.notEqual(ownership.normalizeFor(key, rendered), base, key);
    assert.notEqual(ownership.normalizeFor(key, rendered, rulesTemplate.renderContext(configWith('DEF-BFX-{NUM}'))), base, key);
  }
});

test('manifest: a file rendered by this version with a prefix is a shipped version for a later release', () => {
  const manifest = ownership.loadManifest();
  for (const [key, rel] of Object.entries(TEMPLATES)) {
    const config = configWith('DEF-SIS-{NUM}');
    const existing = rulesTemplate.renderRulesTemplate(template(rel), '0.0.1-test', config);
    const later = `${rulesTemplate.renderRulesTemplate(template(rel), '99.0.0', config)}\nA later release added this line.\n`;
    const result = ownership.classify(manifest, key, existing, later, rulesTemplate.renderContext(config));
    assert.deepEqual(result, { state: 'pristine', reason: 'shipped' }, key);
  }
});

test('init renders the project prefix into both files', () => withProject(configWith('DEF-SIS-{NUM}'), (root) => {
  const result = run(INIT_PATH, root);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  for (const key of Object.keys(TEMPLATES)) {
    const content = read(abs(root, key));
    assert.ok(content.includes('qa/06-defects/open/DEF-SIS-NNN_*.md'), key);
    assert.doesNotMatch(content, /\{PREFIX\}|\{\{[A-Z_]+\}\}/, key);
  }
}));

test('upgrade: a rules file rendered with a prefix by an earlier build is pristine, and the second run changes nothing', () =>
  withProject(configWith('DEF-SIS-{NUM}'), (root) => {
    for (const [key, rel] of Object.entries(TEMPLATES)) {
      fs.mkdirSync(path.dirname(abs(root, key)), { recursive: true });
      fs.writeFileSync(abs(root, key),
        rulesTemplate.renderRulesTemplate(template(rel), '0.0.1-test', configWith('DEF-SIS-{NUM}')));
    }
    const first = run(UPGRADE_PATH, root);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.equal(fs.existsSync(path.join(root, ...ownership.BACKUP_ROOT.split('/'))), false, first.stdout);
    for (const key of Object.keys(TEMPLATES)) {
      const content = read(abs(root, key));
      assert.ok(content.includes('qa/06-defects/open/DEF-SIS-NNN_*.md'), key);
      assert.ok(content.includes(`v${VERSION} `), key);
    }
    const before = snapshot(root);
    const second = run(UPGRADE_PATH, root);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(snapshot(root), before);
    assert.doesNotMatch(second.stdout, /qa-framework-backup/);
  }));

test('upgrade: a prefix typed by hand when the config has none is an edit and is backed up', () =>
  withProject({ project: { name: 'demo' } }, (root) => {
    const key = '.claude/rules/qa-framework.md';
    fs.mkdirSync(path.dirname(abs(root, key)), { recursive: true });
    const handEdited = rulesTemplate.renderRulesTemplate(template(TEMPLATES[key]), '0.0.1-test', configWith('DEF-ZZQ-{NUM}'));
    fs.writeFileSync(abs(root, key), handEdited);
    const result = run(UPGRADE_PATH, root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const backup = path.join(root, ...ownership.BACKUP_ROOT.split('/'), `upgrade-to-${VERSION}`, 'claude', 'rules', 'qa-framework.md');
    assert.equal(read(backup), handEdited);
    assert.ok(read(abs(root, key)).includes('DEF-{PREFIX}-NNN'));
  }));

// --- hygiene ----------------------------------------------------------------------

const CHANGED = [...Object.values(TEMPLATES), 'scripts/lib/rules-template.js'];

test('changed files: UTF-8 without BOM and no forbidden characters', () => {
  for (const rel of CHANGED) {
    const raw = fs.readFileSync(path.join(REPO_ROOT, rel));
    assert.notDeepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${rel} has a BOM`);
    assert.deepEqual(scanText(raw.toString('utf8'), rel), [], `${rel} has forbidden characters`);
  }
});

test('changed files: no consumer project names, prefixes or ADO projects', () => {
  const denylist = [
    /garc[eé]s/i, /biofruit/i, /enrolamiento/i, /sispro/i, /\bgmo/i, /exportadora/i,
    /keber\.flores/i, /DEF-SIS/, /DEF-BFR/, /\bBFR\b/, /bioacsys/i, /gf-gestion/i,
    /powershell-authorization\.md/i, /ADO_PROJECT_READ/,
  ];
  for (const rel of CHANGED) {
    const content = read(path.join(REPO_ROOT, rel));
    for (const pattern of denylist) assert.doesNotMatch(content, pattern, `${rel} leaks ${pattern}`);
  }
});
