#!/usr/bin/env node
'use strict';

/**
 * run-perf.js - validates a k6 performance plan, enforces the safety rules, runs k6
 * and saves the complete report into the evidence folder in one step.
 *
 *   node run-perf.js plans/<topic>.plan.json            validate, then run
 *   node run-perf.js plans/<topic>.plan.json --check    validate only, never runs k6
 *   node run-perf.js plans/<topic>.plan.json --allow-writes
 *                                                      the plan has write endpoints and
 *                                                      this run opts in to them (gate 1)
 *
 * Before k6 is ever started, in this order:
 *   1. the plan is well-formed (perf-guard.validatePlan);
 *   2. the safety rules pass (perf-guard.safetyProblems): QA host only, never prod,
 *      writes as single calls unless a capped concurrent-write authorization is in
 *      the plan, writes only with --allow-writes, no credential in the plan;
 *   3. every session source resolves: the environment variable is set, or the file
 *      exists and git ignores it. Values are never printed;
 *   4. k6 is installed. If it is not, the runner stops; it never installs anything.
 *
 * Exit codes: 0 run finished and every exit criterion met; 1 usage or invalid plan;
 * 2 refused by a safety rule; 3 k6 not installed; 4 k6 ran but produced no summary;
 * otherwise k6's own exit code (99 when an exit criterion was not met), after the
 * report has been saved.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const guard = require('./perf-guard');
const { build } = require('./build-report');

const HERE = __dirname;
// The scaffold lives in qa/07-automation/load/k6/; the manifest is qa/qa-framework.config.json.
const QA_ROOT = path.resolve(HERE, '..', '..', '..');
const MANIFEST = path.join(QA_ROOT, 'qa-framework.config.json');
const K6_INSTALL_DOCS = 'https://grafana.com/docs/k6/latest/set-up/install-k6/';

function isGitIgnored(file) {
  const res = spawnSync('git', ['check-ignore', '-q', '--', file], { cwd: path.dirname(file), encoding: 'utf8' });
  if (res.error) return { known: false, reason: 'git is not available' };
  if (res.status === 0) return { known: true, ignored: true };
  if (res.status === 1) return { known: true, ignored: false };
  return { known: false, reason: 'the file is not inside a git repository' };
}

/**
 * Resolves each session source to its value without printing any value.
 * @param {object} auth     plan.auth
 * @param {{ env: object, baseDir: string, gitIgnored?: Function, readFile?: Function, exists?: Function }} io
 * @returns {{ values: string[], problems: string[], notes: string[] }}
 */
function resolveSessions(auth, io) {
  const out = { values: [], problems: [], notes: [] };
  if (!auth || auth.scheme === 'none') return out;
  const gitIgnored = io.gitIgnored || isGitIgnored;
  const exists = io.exists || fs.existsSync;
  const readFile = io.readFile || ((f) => fs.readFileSync(f, 'utf8'));
  auth.sessions.forEach((source, i) => {
    const label = `auth.sessions[${i}]`;
    let value;
    if (source.env !== undefined) {
      value = io.env[source.env];
      if (typeof value !== 'string' || value.trim() === '') {
        out.problems.push(`${label}: environment variable ${source.env} is not set or is empty`);
        return;
      }
    } else {
      const file = path.resolve(io.baseDir, source.file);
      if (!exists(file)) {
        out.problems.push(`${label}: session file ${source.file} does not exist`);
        return;
      }
      const ignored = gitIgnored(file);
      if (ignored.known && !ignored.ignored) {
        out.problems.push(`${label}: session file ${source.file} is not ignored by git; a live credential must never be committable. Add it to .gitignore (the scaffold ignores .session/)`);
        return;
      }
      if (!ignored.known) out.notes.push(`${label}: could not confirm that ${source.file} is gitignored (${ignored.reason})`);
      value = readFile(file);
    }
    value = String(value).trim();
    if (value === '' || /[\r\n]/.test(value)) {
      out.problems.push(`${label}: the session value must be one non-empty line`);
      return;
    }
    out.values.push(value);
  });
  return out;
}

function k6Available(spawn = spawnSync) {
  const res = spawn('k6', ['version'], { encoding: 'utf8' });
  return !res.error && res.status === 0;
}

function stampOf(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function evidenceDir(plan, date = new Date()) {
  if (plan.outDir) return path.resolve(HERE, plan.outDir);
  return path.join(QA_ROOT, '05-test-execution', 'performance', `${date.toISOString().slice(0, 10)}-${plan.topic}`);
}

function fail(code, lines) {
  for (const line of [].concat(lines)) console.error(line);
  process.exit(code);
}

function readJson(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fail(1, `[run-perf] cannot read ${what} ${file}: ${e.message}`);
  }
}

function main(argv) {
  const args = argv.slice(2);
  const planArg = args.find((a) => !a.startsWith('--'));
  const checkOnly = args.includes('--check');
  const allowWrites = args.includes('--allow-writes');
  const unknown = args.filter((a) => a.startsWith('--') && !['--check', '--allow-writes'].includes(a));
  if (!planArg || unknown.length) {
    fail(1, ['Usage: node run-perf.js plans/<topic>.plan.json [--check] [--allow-writes]',
      unknown.length ? `Unknown option(s): ${unknown.join(' ')}` : '']);
  }
  const planPath = path.resolve(HERE, planArg);
  if (!fs.existsSync(planPath)) fail(1, `[run-perf] plan not found: ${planPath}`);
  const plan = readJson(planPath, 'plan');

  const problems = guard.validatePlan(plan);
  if (problems.length) {
    fail(1, ['[run-perf] the plan is not valid; nothing was run:', ...problems.map((p) => `  - ${p}`),
      'See plans/plan.schema.json and plans/_example.plan.json.']);
  }

  if (!fs.existsSync(MANIFEST)) fail(2, `[run-perf] refused: ${MANIFEST} not found; runs go only to the QA environment it declares (${guard.POLICY}, section 7)`);
  const manifest = readJson(MANIFEST, 'manifest');
  const refusals = guard.safetyProblems(plan, manifest, { allowWrites });
  if (refusals.length) {
    fail(2, ['[run-perf] refused by the safety rules; nothing was run:', ...refusals.map((r) => `  - ${r.message}`)]);
  }

  const sessions = resolveSessions(plan.auth, { env: process.env, baseDir: HERE });
  for (const note of sessions.notes) console.warn(`[run-perf] warning: ${note}`);
  if (sessions.problems.length) {
    fail(2, ['[run-perf] refused: a session source is not usable; nothing was run:', ...sessions.problems.map((p) => `  - ${p}`)]);
  }

  if (checkOnly) {
    console.log(`[run-perf] plan ${planArg} is valid and passes the safety rules (${plan.endpoints.length} endpoint(s), ${sessions.values.length} session(s)). --check: k6 not started.`);
    return 0;
  }

  if (!k6Available()) {
    fail(3, ['[run-perf] k6 is not installed or not on PATH. Nothing was run.',
      `Install it yourself (or ask whoever manages your workstation): ${K6_INSTALL_DOCS}`,
      'This runner never installs software.']);
  }

  const startedAt = new Date();
  const outDir = evidenceDir(plan, startedAt);
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = stampOf(startedAt);
  const outPlan = path.join(outDir, `plan-${plan.topic}-${stamp}.json`);
  // The plan is saved BEFORE the run: the evidence shows the criteria as declared.
  fs.copyFileSync(planPath, outPlan);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-perf-'));
  const effectiveFile = path.join(work, 'plan.effective.json');
  const summaryFile = path.join(work, 'summary.json');
  fs.writeFileSync(effectiveFile, JSON.stringify(guard.effectivePlan(plan), null, 2), 'utf8');

  // Session values travel only in the child's environment: never on the command
  // line (visible in process lists), never in a file.
  const env = { ...process.env, PERF_PLAN: effectiveFile, PERF_SUMMARY: summaryFile, PERF_SESSION_COUNT: String(sessions.values.length) };
  sessions.values.forEach((value, i) => { env[`PERF_SESSION_${i}`] = value; });

  console.log(`[run-perf] running ${plan.testType} test "${plan.topic}" against ${guard.hostOf(plan.baseUrl)} (${plan.endpoints.length} endpoint(s))...`);
  const res = spawnSync('k6', ['run', path.join(HERE, 'perf-script.js')], { cwd: HERE, env, stdio: 'inherit' });

  try {
    if (!fs.existsSync(summaryFile)) {
      console.error(`[run-perf] k6 exited with ${res.status === null ? res.signal : res.status} and wrote no summary; see its output above. The plan copy is in ${outDir}.`);
      return 4;
    }
    const data = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    const finishedAt = stampOf(new Date());
    const outJson = path.join(outDir, `k6-summary-${plan.topic}-${stamp}.json`);
    const outMd = path.join(outDir, `k6-report-${plan.topic}-${stamp}.md`);
    fs.writeFileSync(outJson, JSON.stringify(data, null, 2), 'utf8');
    const baselines = {};
    for (const pair of (plan.comparison || {}).pairs || []) {
      if (pair.baselineSummary === undefined) continue;
      const file = path.resolve(HERE, pair.baselineSummary);
      if (fs.existsSync(file)) baselines[pair.baselineSummary] = JSON.parse(fs.readFileSync(file, 'utf8'));
      else console.warn(`[run-perf] warning: baseline summary ${pair.baselineSummary} not found; that comparison is reported as NO DATA`);
    }
    fs.writeFileSync(outMd, build({ data, plan, planFile: path.relative(QA_ROOT, planPath), stamp: finishedAt, baselines }), 'utf8');
    console.log(`[run-perf] saved:\n  ${outMd}\n  ${outJson}\n  ${outPlan}`);
    if (res.status !== 0) console.log(`[run-perf] k6 exited with ${res.status}: at least one exit criterion was not met or a call failed. The report says which.`);
    return res.status === null ? 1 : res.status;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

module.exports = { resolveSessions, k6Available, evidenceDir, isGitIgnored };

if (require.main === module) {
  process.exitCode = main(process.argv);
}
