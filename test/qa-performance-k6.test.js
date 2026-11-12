'use strict';

// WP3.1: the qa-performance-k6 skill and the k6 load scaffold
// (templates/load-scaffold/k6/). Covers the pure plan validation and safety rules,
// the session resolution, the runner's refusals before k6 starts (k6 is never run
// here), the report builder against a saved k6 summary, and what init and upgrade
// install. Every project lives in a temporary directory.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { scanText } = require('../scripts/check-forbidden-chars.js');
const { buildCommandContent } = require('../scripts/lib/claude-commands.js');
const { LOAD_SCAFFOLD_FILES } = require('../scripts/lib/load-scaffold-files.js');

const REPO_ROOT = path.join(__dirname, '..');
const SCAFFOLD = path.join(REPO_ROOT, 'templates', 'load-scaffold', 'k6');
const SKILL_FILE = path.join(REPO_ROOT, 'skills', 'qa-performance-k6', 'SKILL.md');
const INIT_PATH = path.join(REPO_ROOT, 'scripts', 'init.js');
const UPGRADE_PATH = path.join(REPO_ROOT, 'scripts', 'upgrade.js');
const SUMMARY_FIXTURE = path.join(__dirname, 'fixtures', 'k6', 'summary-example.json');

const guard = require(path.join(SCAFFOLD, 'perf-guard.js'));
const report = require(path.join(SCAFFOLD, 'build-report.js'));
const { resolveSessions } = require(path.join(SCAFFOLD, 'run-perf.js'));

const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const clone = (value) => JSON.parse(JSON.stringify(value));

const QA_URL = 'https://app.qa.example.com';
const MANIFEST = { project: { qaBaseUrl: `${QA_URL}/` } };
const TODAY = '2026-11-12';
const SECRET = 'sess-0123456789-SECRET-VALUE';

function basePlan(overrides = {}) {
  return {
    topic: 'orders',
    testType: 'load',
    baseUrl: `${QA_URL}/api`,
    goAhead: { by: 'QA lead', account: 'lane 2' },
    auth: { scheme: 'cookie', sessions: [{ env: 'QA_PERF_SESSION' }] },
    load: { stages: [{ duration: '30s', target: 3 }, { duration: '90s', target: 3 }, { duration: '15s', target: 0 }] },
    exitCriteria: { p95Ms: 3000, source: 'agreed with the QA lead' },
    endpoints: [{ tag: 'orders_get', method: 'GET', path: 'orders' }],
    ...overrides,
  };
}

const singleWrite = (overrides = {}) => ({
  tag: 'order_edit', method: 'PUT', path: 'orders/edit', writeCatalogId: 'order-edit',
  load: { vus: 1, iterations: 1 }, ...overrides,
});

const authorization = (overrides = {}) => ({
  approvedBy: 'Write approver', approvedOn: TODAY, reason: 'reproduce a race',
  maxVus: 5, maxIterations: 10, expectedRecords: 10, account: 'lane 2',
  confirmation: 'ticket comment 2026-11-12', ...overrides,
});

const safety = (plan, options = {}) => guard.safetyProblems(plan, MANIFEST, { today: TODAY, ...options });

function rulesOf(refusals) {
  return refusals.map((r) => r.rule);
}

// --- Plan validation ----------------------------------------------------------------

test('perf-guard: the shipped example plan is valid and passes the safety rules against its own host', () => {
  const plan = JSON.parse(read(path.join(SCAFFOLD, 'plans', '_example.plan.json')));
  assert.deepEqual(guard.validatePlan(plan), []);
  const manifest = { project: { qaBaseUrl: 'https://your-app.qa.example.com' } };
  assert.deepEqual(guard.safetyProblems(plan, manifest, { today: TODAY }), []);
});

test('perf-guard: a minimal read plan is valid and allowed', () => {
  assert.deepEqual(guard.validatePlan(basePlan()), []);
  assert.deepEqual(safety(basePlan()), []);
});

test('perf-guard: test type, exit criteria, go-ahead and auth are required before a run', () => {
  const plan = basePlan();
  delete plan.testType;
  delete plan.exitCriteria;
  delete plan.goAhead;
  delete plan.auth;
  const problems = guard.validatePlan(plan).join('\n');
  assert.match(problems, /testType is required/);
  assert.match(problems, /exitCriteria is required: declare the exit criteria before the run/);
  assert.match(problems, /goAhead is required/);
  assert.match(problems, /auth is required/);
  assert.match(guard.validatePlan(basePlan({ exitCriteria: { p95Ms: 1000 } })).join('\n'), /exitCriteria\.source is required/);
});

test('perf-guard: structural errors are reported', () => {
  const problems = guard.validatePlan(basePlan({
    endpoints: [
      { tag: '1bad', method: 'GET', path: 'a' },
      { tag: 'abs', method: 'GET', path: 'https://elsewhere.example.com/x' },
      { tag: 'put_query', method: 'PUT', path: 'p', query: { confirmedBy: 'x', evidence: 'y' } },
      { tag: 'post_query', method: 'POST', path: 'p', query: { confirmedBy: 'x' } },
      { tag: 'trace', method: 'TRACE', path: 'p' },
    ],
    load: { vus: 2, iterations: 1 },
  })).join('\n');
  assert.match(problems, /endpoints\[0\]\.tag must start with a letter/);
  assert.match(problems, /endpoints\[1\]\.path must be relative to baseUrl, never a full URL/);
  assert.match(problems, /endpoints\[2\]\.query applies only to POST endpoints/);
  assert.match(problems, /endpoints\[3\]\.query must be/);
  assert.match(problems, /endpoints\[4\]\.method must be one of/);
  assert.match(problems, /load\.iterations must be >= load\.vus/);
});

test('perf-guard: describeLoad normalizes the three load shapes', () => {
  assert.deepEqual(guard.describeLoad({ stages: [{ duration: '1m', target: 4 }, { duration: '30s', target: 0 }] }),
    { shape: 'stages', maxVus: 4, iterations: null, durationSeconds: 90 });
  assert.deepEqual(guard.describeLoad({ vus: 2, iterations: 6 }), { shape: 'iterations', maxVus: 2, iterations: 6, durationSeconds: null });
  assert.deepEqual(guard.describeLoad({ vus: 3, duration: '1m30s' }), { shape: 'duration', maxVus: 3, iterations: null, durationSeconds: 90 });
  assert.ok(guard.describeLoad({ vus: 1, iterations: 1, duration: '1s' }).error);
});

// --- Environment (policy section 7) ----------------------------------------------------

test('environment: a baseUrl on another host is refused, naming the rule and section 7', () => {
  const refusals = safety(basePlan({ baseUrl: 'https://other.example.com/api' }));
  assert.deepEqual(rulesOf(refusals), ['environment']);
  assert.match(refusals[0].message, /^\[environment\] baseUrl host other\.example\.com is not the declared QA host app\.qa\.example\.com/);
  assert.match(refusals[0].message, /write-safety-policy\.md, section 7\)$/);
});

test('environment: a baseUrl containing "prod" is refused even when the manifest declares that host', () => {
  const prodUrl = 'https://app-prod.example.com';
  const refusals = guard.safetyProblems(basePlan({ baseUrl: `${prodUrl}/api` }), { project: { qaBaseUrl: prodUrl } }, { today: TODAY });
  assert.deepEqual(rulesOf(refusals), ['environment']);
  assert.match(refusals[0].message, /contains "prod"/);
  assert.match(refusals[0].message, /section 7/);
  // In the path too: the brief and the policy count a doubtful match as a match.
  assert.match(safety(basePlan({ baseUrl: `${QA_URL}/prod-api` }))[0].message, /contains "prod"/);
});

test('environment: a manifest without project.qaBaseUrl refuses every run', () => {
  const refusals = guard.safetyProblems(basePlan(), { project: {} }, { today: TODAY });
  assert.deepEqual(rulesOf(refusals), ['environment']);
  assert.match(refusals[0].message, /no http\(s\) project\.qaBaseUrl/);
});

// --- Writes under load (policy section 6) ------------------------------------------------

test('writes: a POST that is not a declared query is a write and is refused under a ramp', () => {
  const plan = basePlan({ endpoints: [{ tag: 'orders_post', method: 'POST', path: 'orders', writeCatalogId: 'x' }] });
  const refusals = safety(plan, { allowWrites: true });
  assert.deepEqual(rulesOf(refusals), ['write-under-load']);
  assert.match(refusals[0].message, /orders_post \(POST\) is a write and would run with up to 3 VU\(s\) for 135s with no iteration limit/);
  assert.match(refusals[0].message, /section 6\)$/);
});

test('writes: a POST declared as a query is a read and may ramp', () => {
  const plan = basePlan({ endpoints: [{ tag: 'orders_list', method: 'POST', path: 'orders/list', query: { confirmedBy: 'QA lead', evidence: 'listing' } }] });
  assert.deepEqual(guard.validatePlan(plan), []);
  assert.deepEqual(safety(plan), []);
});

test('writes: a single call (1 VU, 1 iteration) with a catalog entry and --allow-writes is allowed', () => {
  const plan = basePlan({ endpoints: [singleWrite()] });
  assert.deepEqual(guard.validatePlan(plan), []);
  assert.deepEqual(safety(plan, { allowWrites: true }), []);
});

test('writes: without --allow-writes a plan with a write is refused by gate 1 (section 2)', () => {
  const refusals = safety(basePlan({ endpoints: [singleWrite()] }));
  assert.deepEqual(rulesOf(refusals), ['write-opt-in']);
  assert.match(refusals[0].message, /--allow-writes/);
  assert.match(refusals[0].message, /section 2\)$/);
});

test('writes: more than one VU or more than one iteration is refused without an authorization', () => {
  for (const load of [{ vus: 1, iterations: 2 }, { vus: 2, iterations: 2 }, { vus: 1, duration: '10s' }]) {
    const refusals = safety(basePlan({ endpoints: [singleWrite({ load })] }), { allowWrites: true });
    assert.deepEqual(rulesOf(refusals), ['write-under-load'], JSON.stringify(load));
    assert.match(refusals[0].message, /Writes are not load-tested by default/);
  }
});

test('writes: a write without writeCatalogId is refused (gate 2)', () => {
  const refusals = safety(basePlan({ endpoints: [singleWrite({ writeCatalogId: undefined })] }), { allowWrites: true });
  assert.deepEqual(rulesOf(refusals), ['write-approval']);
  assert.match(refusals[0].message, /section 2\)$/);
});

test('concurrent write: a complete authorization within its cap, dated today, is allowed', () => {
  const plan = basePlan({ endpoints: [singleWrite({ load: { vus: 5, iterations: 10 }, concurrentWrite: authorization() })] });
  assert.deepEqual(guard.validatePlan(plan), []);
  assert.deepEqual(safety(plan, { allowWrites: true }), []);
  // A time-based load needs maxDuration and stays within it.
  const timed = basePlan({ endpoints: [singleWrite({
    load: { stages: [{ duration: '10s', target: 3 }, { duration: '20s', target: 3 }] },
    concurrentWrite: authorization({ maxIterations: undefined, maxDuration: '30s' }),
  })] });
  assert.deepEqual(safety(timed, { allowWrites: true }), []);
});

test('concurrent write: the cap is enforced on VUs, iterations and duration', () => {
  const cases = [
    [{ vus: 6, iterations: 10 }, {}, /reaches 6 VUs, above the authorized maxVus 5/],
    [{ vus: 5, iterations: 11 }, {}, /runs 11 iterations, above the authorized maxIterations 10/],
    [{ vus: 2, duration: '10s' }, {}, /time-based \(duration\); the authorization must cap maxDuration/],
    [{ vus: 2, duration: '31s' }, { maxIterations: undefined, maxDuration: '30s' }, /runs 31s, above the authorized maxDuration 30s/],
    [{ vus: 2, iterations: 2 }, { maxIterations: undefined, maxDuration: '30s' }, /must cap maxIterations/],
  ];
  for (const [load, auth, expected] of cases) {
    const refusals = safety(basePlan({ endpoints: [singleWrite({ load, concurrentWrite: authorization(auth) })] }), { allowWrites: true });
    assert.deepEqual(rulesOf(refusals), ['write-under-load'], JSON.stringify(load));
    assert.match(refusals[0].message, expected);
    assert.match(refusals[0].message, /section 6\)$/);
  }
});

test('concurrent write: an authorization from another day, or missing a field or a cap, is refused', () => {
  const run = (auth) => safety(basePlan({ endpoints: [singleWrite({ load: { vus: 2, iterations: 2 }, concurrentWrite: auth })] }), { allowWrites: true });
  assert.match(run(authorization({ approvedOn: '2026-11-11' }))[0].message, /covers one run on the day it was given \(today is 2026-11-12\)/);
  const missing = run(authorization({ approvedBy: undefined, expectedRecords: undefined, confirmation: '' })).map((r) => r.message).join('\n');
  assert.match(missing, /concurrentWrite\.approvedBy is required/);
  assert.match(missing, /concurrentWrite\.expectedRecords is required/);
  assert.match(missing, /concurrentWrite\.confirmation is required/);
  assert.match(run(authorization({ maxIterations: undefined }))[0].message, /needs a cap: maxIterations or maxDuration/);
});

test('concurrent write: an authorization on a read endpoint or on a single call is refused as misplaced', () => {
  const onRead = safety(basePlan({ endpoints: [{ tag: 'g', method: 'GET', path: 'g', concurrentWrite: authorization() }] }));
  assert.match(onRead[0].message, /is a read; concurrentWrite applies only to write endpoints/);
  const onSingle = safety(basePlan({ endpoints: [singleWrite({ concurrentWrite: authorization() })] }), { allowWrites: true });
  assert.match(onSingle[0].message, /runs as a single call; remove concurrentWrite/);
});

// --- Credentials ---------------------------------------------------------------------

test('credentials: a credential field anywhere in the plan is refused', () => {
  const plan = basePlan({ endpoints: [{ tag: 'g', method: 'POST', path: 'login', query: { confirmedBy: 'a', evidence: 'b' }, body: { user: 'qa', password: 'x' } }] });
  const refusals = safety(plan);
  assert.deepEqual(rulesOf(refusals), ['credentials']);
  assert.match(refusals[0].message, /endpoints\[0\]\.body\.password/);
  assert.match(safety(basePlan({ cookie: 'a=b' }))[0].message, /credentials never go in a plan/);
  assert.match(guard.validatePlan(basePlan({ auth: { scheme: 'cookie', sessions: [{ env: 'abc=def' }] } })).join('\n'), /environment variable NAME/);
});

test('sessions: values come from the environment or a gitignored file and are never echoed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-perf-sessions-'));
  try {
    fs.writeFileSync(path.join(dir, 'ok.txt'), `${SECRET}\n`);
    fs.writeFileSync(path.join(dir, 'tracked.txt'), SECRET);
    fs.writeFileSync(path.join(dir, 'multi.txt'), `${SECRET}\nsecond line`);
    const gitIgnored = (file) => ({ known: true, ignored: path.basename(file) !== 'tracked.txt' });
    const auth = { scheme: 'cookie', sessions: [{ env: 'QA_PERF_SESSION' }, { file: 'ok.txt' }] };

    const good = resolveSessions(auth, { env: { QA_PERF_SESSION: SECRET }, baseDir: dir, gitIgnored });
    assert.deepEqual(good.problems, []);
    assert.deepEqual(good.values, [SECRET, SECRET]);

    const bad = resolveSessions({ scheme: 'cookie', sessions: [{ env: 'QA_PERF_SESSION' }, { file: 'missing.txt' }, { file: 'tracked.txt' }, { file: 'multi.txt' }] },
      { env: {}, baseDir: dir, gitIgnored });
    assert.equal(bad.problems.length, 4);
    assert.match(bad.problems[0], /QA_PERF_SESSION is not set/);
    assert.match(bad.problems[1], /missing\.txt does not exist/);
    assert.match(bad.problems[2], /tracked\.txt is not ignored by git/);
    assert.match(bad.problems[3], /must be one non-empty line/);
    assert.ok(!bad.problems.join('\n').includes(SECRET), 'a problem message must never contain the session value');

    const unknown = resolveSessions({ scheme: 'bearer', sessions: [{ file: 'ok.txt' }] },
      { env: {}, baseDir: dir, gitIgnored: () => ({ known: false, reason: 'git is not available' }) });
    assert.deepEqual(unknown.problems, []);
    assert.match(unknown.notes[0], /could not confirm/);
    assert.deepEqual(resolveSessions({ scheme: 'none' }, { env: {}, baseDir: dir }).values, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- The runner, end to end before k6 ------------------------------------------------------

function withK6Project(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-perf-runner-'));
  try {
    const k6 = path.join(root, 'qa', '07-automation', 'load', 'k6');
    for (const rel of LOAD_SCAFFOLD_FILES) {
      const dest = path.join(k6, ...rel.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(SCAFFOLD, ...rel.split('/')), dest);
    }
    fs.writeFileSync(path.join(root, 'qa', 'qa-framework.config.json'), JSON.stringify(MANIFEST));
    body({ root, k6 });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runPerf(k6, args, env) {
  const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-perf-nobin-'));
  try {
    // PATH points at an empty folder, so k6 is never found and never runs.
    return spawnSync(process.execPath, [path.join(k6, 'run-perf.js'), ...args], {
      cwd: k6,
      env: { SystemRoot: process.env.SystemRoot || '', PATH: emptyBin, Path: emptyBin, ...env },
      encoding: 'utf8',
    });
  } finally {
    fs.rmSync(emptyBin, { recursive: true, force: true });
  }
}

function writePlan(k6, plan) {
  fs.writeFileSync(path.join(k6, 'plans', `${plan.topic}.plan.json`), JSON.stringify(plan, null, 2));
  return `plans/${plan.topic}.plan.json`;
}

test('run-perf: --check validates, passes the rules and resolves sessions without printing them', () => {
  withK6Project(({ k6 }) => {
    const r = runPerf(k6, [writePlan(k6, basePlan()), '--check'], { QA_PERF_SESSION: SECRET });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /is valid and passes the safety rules \(1 endpoint\(s\), 1 session\(s\)\)/);
    assert.ok(!`${r.stdout}${r.stderr}`.includes(SECRET));
  });
});

test('run-perf: a safety refusal exits 2 before k6, naming the rule and the policy section', () => {
  withK6Project(({ k6 }) => {
    const r = runPerf(k6, [writePlan(k6, basePlan({ endpoints: [singleWrite({ load: { vus: 3, iterations: 30 } })] }))], { QA_PERF_SESSION: SECRET });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /refused by the safety rules; nothing was run/);
    assert.match(r.stderr, /\[write-under-load\][^\n]*section 6\)/);
    assert.match(r.stderr, /\[write-opt-in\][^\n]*section 2\)/);
    assert.equal(fs.existsSync(path.join(k6, '..', '..', '..', '05-test-execution')), false, 'nothing is written on refusal');
  });
});

test('run-perf: an invalid plan exits 1 and a missing session exits 2 without the value', () => {
  withK6Project(({ k6 }) => {
    const invalid = basePlan();
    delete invalid.exitCriteria;
    const r1 = runPerf(k6, [writePlan(k6, invalid)], {});
    assert.equal(r1.status, 1);
    assert.match(r1.stderr, /the plan is not valid; nothing was run/);
    const r2 = runPerf(k6, [writePlan(k6, basePlan()), '--check'], {});
    assert.equal(r2.status, 2);
    assert.match(r2.stderr, /QA_PERF_SESSION is not set/);
  });
});

test('run-perf: without k6 installed the runner stops with a clear message and installs nothing', () => {
  withK6Project(({ k6 }) => {
    const r = runPerf(k6, [writePlan(k6, basePlan())], { QA_PERF_SESSION: SECRET });
    assert.equal(r.status, 3, r.stderr);
    assert.match(r.stderr, /k6 is not installed or not on PATH\. Nothing was run\./);
    assert.match(r.stderr, /never installs software/);
  });
});

// --- The report ------------------------------------------------------------------------

const REPORT_PLAN = {
  topic: 'orders', testType: 'load', baseUrl: `${QA_URL}/api`,
  goAhead: { by: 'QA lead', account: 'lane 2' },
  auth: { scheme: 'cookie', sessions: [{ env: 'QA_PERF_SESSION' }, { file: '.session/lane3.txt' }] },
  load: { stages: [{ duration: '30s', target: 3 }, { duration: '90s', target: 3 }] },
  exitCriteria: { p95Ms: 3000, source: 'agreed with the QA lead', perEndpoint: { create_item: { p95Ms: 2000 } } },
  comparison: { pairs: [{ baseline: 'list_v1', candidate: 'list_v2', maxRegressionPct: 0, minSpeedup: 2 }] },
  context: ['Run in the morning window.'],
  endpoints: [
    { tag: 'list_v1', method: 'GET', path: 'v1/list', dataVolume: '5000 orders' },
    { tag: 'list_v2', method: 'GET', path: 'v2/list', dataVolume: '5000 orders' },
    { tag: 'slow_report', method: 'GET', path: 'report' },
    { tag: 'broken', method: 'GET', path: 'broken' },
    { tag: 'create_item', method: 'PUT', path: 'items', writeCatalogId: 'item-create', load: { vus: 1, iterations: 1 } },
  ],
};

function buildFixtureReport(plan = REPORT_PLAN) {
  const data = JSON.parse(read(SUMMARY_FIXTURE));
  return report.build({ data, plan, planFile: 'plans/orders.plan.json', stamp: '2026-11-12T10-00-00-000Z' });
}

test('report: verdicts against the declared criteria; failed calls are INVALID, never MET', () => {
  const md = buildFixtureReport();
  const row = (tag) => md.split('\n').find((line) => line.startsWith(`| ${tag} | `));
  assert.match(row('list_v1'), /\| MET \|$/);
  assert.match(row('list_v2'), /\| MET \|$/);
  assert.match(row('slow_report'), /\| NOT MET \(p95 4200 ms >= 3000 ms\) \|$/);
  // A fast p95 (900 ms) with 5 failed calls is still INVALID.
  assert.match(row('broken'), /\| INVALID \(5 of 20 calls failed\) \|$/);
  assert.match(md, /INVALID for broken: 5 of 20 calls failed/);
  assert.match(row('create_item'), /< 2000 ms \|.*\| MET \|$/);
  assert.match(md, /Overall verdict: \*\*INVALID\*\*/);
  assert.doesNotMatch(md.split('\n').filter((l) => l.startsWith('| broken |')).join('\n'), /\| MET/);
});

test('report: endpointVerdict and overallVerdict never turn failed calls into MET', () => {
  const ok = { calls: 100, failed: 0, p95: 100, p99: 150, rate: 5 };
  assert.equal(report.endpointVerdict(ok, { p95Ms: 200 }).verdict, 'MET');
  assert.equal(report.endpointVerdict({ ...ok, failed: 1 }, { p95Ms: 200 }).verdict, 'INVALID');
  assert.equal(report.endpointVerdict({ ...ok, calls: 0 }, { p95Ms: 200 }).verdict, 'NO DATA');
  assert.deepEqual(report.endpointVerdict(ok, { p95Ms: 200, p99Ms: 100, minThroughputRps: 10 }).reasons.length, 2);
  assert.equal(report.overallVerdict(['MET', 'MET']), 'MET');
  assert.equal(report.overallVerdict(['MET', 'NOT MET']), 'NOT MET');
  assert.equal(report.overallVerdict(['NOT MET', 'INVALID']), 'INVALID');
});

test('report: baseline vs candidate is evaluated with the declared criterion', () => {
  const md = buildFixtureReport();
  assert.match(md, /## 2\. Baseline vs candidate/);
  const row = md.split('\n').find((l) => l.startsWith('| list_v2 | list_v1 |'));
  assert.match(row, /2\.25x/);
  assert.match(row, /-52%/);
  assert.match(row, /\| MET \|$/);
  const stricter = clone(REPORT_PLAN);
  stricter.comparison.pairs[0].minSpeedup = 3;
  const strictRow = buildFixtureReport(stricter).split('\n').find((l) => l.startsWith('| list_v2 | list_v1 |'));
  assert.match(strictRow, /NOT MET \(candidate is 2\.25x the baseline speed by avg \(required 3x\)\)/);
  const invalid = clone(REPORT_PLAN);
  invalid.comparison.pairs[0].baseline = 'broken';
  const invalidRow = buildFixtureReport(invalid).split('\n').find((l) => l.startsWith('| list_v2 | broken |'));
  assert.match(invalidRow, /INVALID \(failed calls in the baseline or the candidate\)/);
});

test('report: has the sections of the source report and states limitations', () => {
  const md = buildFixtureReport();
  for (const heading of ['## 1. Summary against the exit criteria', '## 3. Configuration', '## 4. Results per endpoint',
    '### HTTP status codes per endpoint', '## 5. Checks and global HTTP metrics', '## 6. Context, assumptions and limitations',
    '## Annex A. All metrics recorded by k6', '## Annex B. Plan used']) {
    assert.ok(md.includes(heading), `missing ${heading}`);
  }
  assert.match(md, /\| list_v1 \| 120 \| 1800 ms \| 900 ms \| 1700 ms \| 2300 ms \| 2500 ms \| 2900 ms \| 3100 ms \| 0\.89 \|/);
  assert.match(md, /\| broken \| 0 \(no response: network error or client timeout\) \| 5 \|/);
  assert.match(md, /\| broken: status 200 \| 15 \| 5 \|/);
  assert.match(md, /broken completed only 20 call\(s\)/);
  assert.match(md, /Data representativeness: NOT STATED for slow_report, broken, create_item/);
  assert.match(md, /Server monitoring: none recorded/);
  assert.match(md, /- Run in the morning window\./);
  assert.match(md, /Test type \(ISTQB CT-PT\): load/);
  assert.match(md, /create_item: catalog entry item-create; single real call/);
});

test('report: names session sources but never contains a session value', () => {
  const md = buildFixtureReport();
  assert.match(md, /environment variable QA_PERF_SESSION, file lane3\.txt/);
  assert.ok(!md.includes(SECRET));
  assert.deepEqual(scanText(md), []);
});

test('report: the standalone CLI rebuilds a report from saved files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-perf-report-'));
  try {
    const planFile = path.join(dir, 'plan.json');
    const out = path.join(dir, 'out.md');
    fs.writeFileSync(planFile, JSON.stringify(REPORT_PLAN));
    const r = spawnSync(process.execPath, [path.join(SCAFFOLD, 'build-report.js'), SUMMARY_FIXTURE, planFile, out], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(read(out), /# k6 performance report - orders/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- Scaffold, skill, init and upgrade ------------------------------------------------------

test('scaffold: the k6 script imports no remote module and prints no body or header', () => {
  const script = read(path.join(SCAFFOLD, 'perf-script.js'));
  const imports = [...script.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports.filter((m) => !m.startsWith('k6')), []);
  assert.doesNotMatch(script, /console\.log\([^)]*(body|headers|Cookie|Authorization)/);
});

test('scaffold and skill: no forbidden characters, and the skill implements policy sections 6 and 7', () => {
  const files = [SKILL_FILE, ...LOAD_SCAFFOLD_FILES.map((rel) => path.join(SCAFFOLD, ...rel.split('/')))];
  for (const file of files) assert.deepEqual(scanText(read(file)), [], file);
  const skill = read(SKILL_FILE);
  const front = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(front);
  assert.match(front[1], /^name: qa-performance-k6$/m);
  assert.match(skill, /\*\*Stage\*\*: Optional - Performance\. No pipeline order dependency/);
  assert.match(skill, /`qa\/00-standards\/write-safety-policy\.md` section 6 \(writes under load\) and section 7 \(environment\)/);
  for (const topic of [/Name the test type before running/, /Percentiles and throughput, never the average alone/,
    /Exit criteria declared before the run, not fitted to the result/, /Baseline vs candidate/, /Data representativeness/,
    /Server-side monitoring/, /### Concurrent write authorization \(format\)/, /never installs|do not install it/]) {
    assert.match(skill, topic);
  }
  for (const name of ['run-perf.js', 'perf-guard.js', 'build-report.js', 'plans/plan.schema.json', 'plans/_example.plan.json']) {
    assert.ok(skill.includes(name), `the skill should name ${name}`);
    assert.ok(fs.existsSync(path.join(SCAFFOLD, ...name.split('/'))), `${name} missing from the scaffold`);
  }
});

test('init installs the k6 scaffold, its .gitignore, the skill and its command; upgrade delivers the skill', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-k6-'));
  try {
    const env = { ...process.env, INIT_CWD: root };
    const init = spawnSync(process.execPath, [INIT_PATH], { cwd: root, env, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const k6 = path.join(root, 'qa', '07-automation', 'load', 'k6');
    for (const rel of LOAD_SCAFFOLD_FILES) {
      assert.equal(read(path.join(k6, ...rel.split('/'))), read(path.join(SCAFFOLD, ...rel.split('/'))), rel);
    }
    assert.match(read(path.join(k6, '.gitignore')), /^\.session\/$/m);
    assert.ok(fs.existsSync(path.join(root, '.github', 'skills', 'qa-performance-k6', 'SKILL.md')));
    assert.equal(read(path.join(root, '.claude', 'commands', 'qa-performance-k6.md')), buildCommandContent('qa-performance-k6'));
    for (const rules of [path.join(root, '.github', 'instructions', 'qa-framework.instructions.md'), path.join(root, '.claude', 'rules', 'qa-framework.md')]) {
      assert.match(read(rules), /qa-performance-k6/);
    }

    // A project installed before the skill existed.
    fs.rmSync(path.join(root, '.github', 'skills', 'qa-performance-k6'), { recursive: true });
    fs.rmSync(path.join(root, '.claude', 'commands', 'qa-performance-k6.md'));
    const upgrade = spawnSync(process.execPath, [UPGRADE_PATH], { cwd: root, env, encoding: 'utf8' });
    assert.equal(upgrade.status, 0, upgrade.stderr);
    assert.ok(fs.existsSync(path.join(root, '.github', 'skills', 'qa-performance-k6', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(root, '.claude', 'commands', 'qa-performance-k6.md')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the skill is listed in every pipeline table and skill list of the repository', () => {
  const lists = [
    'templates/qa-framework.instructions.md', 'templates/qa-framework.rules.md', 'README.md',
    '.github/copilot-instructions.md', 'docs/skills-architecture.md', 'docs/folder-structure-guide.md',
  ];
  for (const rel of lists) assert.match(read(path.join(REPO_ROOT, rel)), /qa-performance-k6/, rel);
  assert.match(buildCommandContent('qa-performance-k6'), /Optional stage, no order dependency/);
});
