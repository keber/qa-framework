'use strict';

// Guards for templates/qa-framework.rules.md, the file init/upgrade install as
// .claude/rules/qa-framework.md. Claude Code does not read .github/instructions/, so
// this file is the ONLY place a Claude Code project learns the lane-lock rule. It
// shipped without it until docs/decisions/lane-heartbeat-caller.md was implemented,
// which meant Claude Code projects got the stale-lane sweep with no rule naming who
// keeps a lane alive - the exact setup of the 2026-08-22 incident.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const RULES_PATH = path.join(REPO_ROOT, 'templates', 'qa-framework.rules.md');
const INSTR_PATH = path.join(REPO_ROOT, 'templates', 'qa-framework.instructions.md');
const INIT_PATH = path.join(REPO_ROOT, 'scripts', 'init.js');
const UPGRADE_PATH = path.join(REPO_ROOT, 'scripts', 'upgrade.js');

const PROTOCOL_HEADING = '## Lane lock - Claude Code dispatcher protocol';

const read = (p) => fs.readFileSync(p, 'utf8');

/** Numbered top-level rules of the "## Agent behavior rules" section: { number -> text }. */
function agentRules(content) {
  const start = content.indexOf('## Agent behavior rules');
  assert.notEqual(start, -1, 'missing "## Agent behavior rules" section');
  const rest = content.slice(start + 1);
  const end = rest.indexOf('\n## ');
  const section = end === -1 ? rest : rest.slice(0, end);
  const rules = {};
  for (const line of section.split(/\r?\n/)) {
    const m = /^(\d+)\. (.*)$/.exec(line);
    if (m) rules[Number(m[1])] = m[2];
  }
  return rules;
}

/** Body of a "## " section, up to the next "## " heading. */
function section(content, heading) {
  const start = content.indexOf(heading);
  assert.notEqual(start, -1, `missing section "${heading}"`);
  const rest = content.slice(start + heading.length);
  const end = rest.indexOf('\n## ');
  return end === -1 ? rest : rest.slice(0, end);
}

function run(script, cwd) {
  return spawnSync(process.execPath, [script], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
}

test('rules.md and instructions.md number their agent rules identically', () => {
  // Skills and agent templates cite rules by number ("regla 10"); the two files are
  // the same rule set for two agents, so one number must mean the same rule in both.
  const rules = agentRules(read(RULES_PATH));
  const instr = agentRules(read(INSTR_PATH));
  assert.deepEqual(Object.keys(rules), Object.keys(instr));
  for (const n of Object.keys(instr)) {
    const title = (s) => (/^\*\*([^*:]+)/.exec(s) || [])[1];
    if (title(instr[n])) {
      assert.equal(title(rules[n]), title(instr[n]), `rule ${n} has a different title in rules.md`);
    }
  }
});

test('rules.md rule 12 is the lane lock and points at the Claude Code protocol', () => {
  const rule12 = agentRules(read(RULES_PATH))[12];
  assert.ok(rule12, 'rules.md has no rule 12');
  assert.match(rule12, /^\*\*Lane lock for parallel QA execution \(BLOCKING\):\*\*/);
  assert.match(rule12, /the dispatcher must keep the lane alive with `heartbeat`/);
  assert.match(rule12, /do not rely on the dispatched worker/);
  assert.ok(rule12.includes(PROTOCOL_HEADING.replace('## ', '')), 'rule 12 must name the protocol section');
});

test('Claude Code protocol: the dispatcher heartbeats from its own wait loop', () => {
  const body = section(read(RULES_PATH), PROTOCOL_HEADING);
  assert.match(body, /`<S>` below is `qa\/07-automation\/e2e\/scripts\/lane-lock\.js`/);
  // Both verbs pass the request_id so lane-lock checks the holder atomically.
  assert.match(body, /node "\$S" heartbeat "\$L" "\$ID"/, 'the pump must call heartbeat with the request_id');
  assert.match(body, /node <S> release <lane> <request_id>/);
  // The status-based holder check stays: it is the only protection on an older
  // lane-lock.js, which silently ignores the extra argument.
  assert.match(body, /node "\$S" status/, 'the pump keeps its status-based holder check');
  assert.match(body, /heartbeat <lane> \[request_id\]/, 'step 1 must detect holder-check support');
  assert.match(body, /node <S> status/);
  assert.match(body, /QA_LANE_STALE_MINUTES/);
  assert.match(body, /\bthe dispatcher\b[^.]*\bheartbeat\b/i);
  // The ADR's Consequences require both of these to be defined per agent.
  assert.match(body, /### Verifying a held lane/);
  assert.match(body, /### Clearing an orphaned lane/);
  // The notification-never-arrives case must be handled explicitly.
  assert.match(body, /### When the completion notification never arrives/);
});

test('Claude Code protocol: the worker is never made responsible for liveness', () => {
  const body = section(read(RULES_PATH), PROTOCOL_HEADING);
  const propagation = section(body, '### What travels in the worker prompt');
  assert.match(propagation, /never acquire, reserve, release or force-release/i);
  // The ADR removes the worker from the liveness path; a worker instruction to send
  // heartbeats would reintroduce the dependency that broke on 2026-08-22.
  assert.doesNotMatch(propagation, /(must|always|have to|has to)\s+(send|call|run)\s+[^.]*heartbeat/i);
});

test('init installs the lane protocol into .claude/rules/qa-framework.md', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-rules-'));
  try {
    const r = run(INIT_PATH, cwd);
    assert.equal(r.status, 0, r.stderr);
    const installed = read(path.join(cwd, '.claude', 'rules', 'qa-framework.md'));
    assert.ok(installed.includes(PROTOCOL_HEADING));
    assert.doesNotMatch(installed, /\{\{VERSION\}\}/);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('upgrade overwrites an older .claude/rules/qa-framework.md with the lane protocol', () => {
  // Existing projects only get the rule if upgrade treats the file as framework-owned.
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-rules-'));
  try {
    assert.equal(run(INIT_PATH, cwd).status, 0);
    const rulesFile = path.join(cwd, '.claude', 'rules', 'qa-framework.md');
    fs.writeFileSync(rulesFile, '# QA Framework Instructions\n\n## Agent behavior rules\n\n0. old\n', 'utf8');
    const r = run(UPGRADE_PATH, cwd);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(read(rulesFile).includes(PROTOCOL_HEADING));
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
