'use strict';

/**
 * Tests for the lane STATE: acquire, reserve, release, heartbeat, the staleness
 * predicate at its boundaries, the queue cap, and lock-directory precedence.
 *
 * lane-lock.js resolves its lock directory and lane table at module load, so tests
 * that need a different config or a different lock dir run the module in a CHILD
 * PROCESS with its own cwd and env. Sharing one loaded module across cases would let
 * one test's lane table leak into another's, which is exactly the class of bug these
 * tests exist to catch.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCAFFOLD_SCRIPTS = path.join(
  __dirname, '..', 'templates', 'automation-scaffold', 'scripts'
);
const LANE_LOCK = path.join(SCAFFOLD_SCRIPTS, 'lane-lock.js');

const THREE_LANES = {
  parallelLanes: {
    enabled: true,
    lanes: [
      { id: '1', account: 'QA_USER', storageState: '.auth/user-default.json', mcpNamespace: 'mcp__pw1__', runnerProject: 'chromium-lane-1', capabilities: ['mcp'] },
      { id: '2', account: 'QA_USER2', storageState: '.auth/user-2.json', mcpNamespace: 'mcp__pw2__', runnerProject: 'chromium-lane-2', capabilities: ['mcp'] },
      { id: '3', account: 'QA_USER3', storageState: '.auth/user-3.json', runnerProject: 'chromium-lane-3', capabilities: [] },
    ],
  },
};

/**
 * Creates a throwaway project: an e2e/ dir holding a copy of the lane scripts and a
 * config, so the scripts see the same relative layout they will have once scaffolded
 * (scripts/ under e2e/, .env and .locks/ as siblings of scripts/).
 */
function makeProject(config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lane-lock-'));
  const e2e = path.join(root, 'e2e');
  const scripts = path.join(e2e, 'scripts');
  fs.mkdirSync(scripts, { recursive: true });
  for (const file of ['lane-config.js', 'lane-lock.js', 'global-setup-guards.js']) {
    fs.copyFileSync(path.join(SCAFFOLD_SCRIPTS, file), path.join(scripts, file));
  }
  if (config !== undefined) {
    fs.writeFileSync(path.join(e2e, 'qa-framework.config.json'), JSON.stringify(config), 'utf8');
  }
  return { root, e2e, scripts, laneLock: path.join(scripts, 'lane-lock.js') };
}

/** Runs the lane-lock CLI inside a project. Returns { status, stdout, stderr, json }. */
function runCli(project, args, env) {
  const result = spawnSync(process.execPath, [project.laneLock, ...args], {
    cwd: project.e2e,
    env: { ...process.env, QA_LANE_LOCKS_DIR: '', ...env },
    encoding: 'utf8',
  });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* non-JSON output (an error path) */ }
  return { ...result, json };
}

/**
 * Installs a minimal `dotenv` into the project's node_modules.
 *
 * dotenv is a devDependency of the generated project and is not installed in this
 * framework repo, so without this the lane-lock code path that calls dotenv.parse()
 * is never exercised: every .env read falls through to the MODULE_NOT_FOUND fallback
 * parser instead. That gap matters specifically here, because the property under test
 * is that lane-lock uses parse() and never config(). A test that silently exercises
 * only the fallback would pass just as happily against a config() implementation.
 *
 * The stub implements parse() faithfully and gives config() the real config()
 * behavior of injecting everything into process.env, so a switch to config() is
 * actually observable as a leak.
 */
function installDotenvStub(project) {
  const dir = path.join(project.e2e, 'node_modules', 'dotenv');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'dotenv', version: '16.0.0', main: 'index.js' }), 'utf8');
  fs.writeFileSync(path.join(dir, 'index.js'), `
    'use strict';
    const fs = require('fs');
    function parse(src) {
      const out = {};
      for (const line of String(src).split(/\\r?\\n/)) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const i = t.indexOf('=');
        if (i === -1) continue;
        let v = t.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        out[t.slice(0, i).trim()] = v;
      }
      return out;
    }
    // Real dotenv behavior: config() injects EVERY key into process.env.
    function config(opts) {
      const parsed = parse(fs.readFileSync((opts && opts.path) || '.env'));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
      return { parsed };
    }
    module.exports = { parse, config };
  `, 'utf8');
}

/** Evaluates `code` with the project's lane-lock module in scope, in a child process. */
function runInProject(project, code, env) {
  const result = spawnSync(
    process.execPath,
    ['-e', `const laneLock = require(${JSON.stringify(project.laneLock)});\n${code}`],
    { cwd: project.e2e, env: { ...process.env, QA_LANE_LOCKS_DIR: '', ...env }, encoding: 'utf8' }
  );
  return result;
}

function cleanup(project) {
  fs.rmSync(project.root, { recursive: true, force: true });
}

// --- Staleness predicate at its boundaries --------------------------------------
// Loaded in-process: isLaneStale is pure and takes `now` and the threshold as
// arguments, so it needs no filesystem or config isolation.
const laneLock = require(LANE_LOCK);

test('isLaneStale: a free lane is never stale', () => {
  assert.equal(laneLock.isLaneStale({ status: 'free', acquired_at: null, last_heartbeat: null }, Date.now(), 20), false);
});

test('isLaneStale: a busy lane younger than the threshold is not stale even with no heartbeat', () => {
  const now = Date.now();
  const laneState = { status: 'busy', acquired_at: new Date(now - 5 * 60_000).toISOString(), last_heartbeat: null };
  assert.equal(laneLock.isLaneStale(laneState, now, 20), false);
});

test('isLaneStale: a busy lane past the threshold with NO heartbeat is stale', () => {
  const now = Date.now();
  const laneState = { status: 'busy', acquired_at: new Date(now - 25 * 60_000).toISOString(), last_heartbeat: null };
  assert.equal(laneLock.isLaneStale(laneState, now, 20), true);
});

// The composite half that matters: a recent heartbeat proves the holder is alive, so
// the lane is not stale no matter how old the acquisition is. This is the case the
// 2026-08-22 incident turned on.
test('isLaneStale: a long-held lane with a RECENT heartbeat is NOT stale', () => {
  const now = Date.now();
  const laneState = {
    status: 'busy',
    acquired_at: new Date(now - 120 * 60_000).toISOString(),
    last_heartbeat: new Date(now - 2 * 60_000).toISOString(),
  };
  assert.equal(laneLock.isLaneStale(laneState, now, 20), false);
});

test('isLaneStale: a long-held lane with a STALE heartbeat is stale', () => {
  const now = Date.now();
  const laneState = {
    status: 'busy',
    acquired_at: new Date(now - 40 * 60_000).toISOString(),
    last_heartbeat: new Date(now - 25 * 60_000).toISOString(),
  };
  assert.equal(laneLock.isLaneStale(laneState, now, 20), true);
});

// Boundary: the predicate uses >=, so exactly-at-threshold counts as stale.
test('isLaneStale: exactly at the threshold is stale; one second under is not', () => {
  const now = Date.now();
  const at = { status: 'busy', acquired_at: new Date(now - 20 * 60_000).toISOString(), last_heartbeat: null };
  const under = { status: 'busy', acquired_at: new Date(now - 20 * 60_000 + 1000).toISOString(), last_heartbeat: null };
  assert.equal(laneLock.isLaneStale(at, now, 20), true);
  assert.equal(laneLock.isLaneStale(under, now, 20), false);
});

test('isLaneStale: heartbeat exactly at the threshold is stale; one second under is not', () => {
  const now = Date.now();
  const base = { status: 'busy', acquired_at: new Date(now - 60 * 60_000).toISOString() };
  assert.equal(laneLock.isLaneStale({ ...base, last_heartbeat: new Date(now - 20 * 60_000).toISOString() }, now, 20), true);
  assert.equal(laneLock.isLaneStale({ ...base, last_heartbeat: new Date(now - 20 * 60_000 + 1000).toISOString() }, now, 20), false);
});

// --- sweepStale -----------------------------------------------------------------

test('sweepStale: frees a stale lane, leaves a heartbeating one alone, and logs the sweep', () => {
  const project = makeProject(THREE_LANES);
  try {
    const result = runInProject(project, `
      const now = Date.now();
      const state = laneLock.defaultState();
      state.lanes['1'] = { status: 'busy', holder: 'req-stale', acquired_at: new Date(now - 30*60000).toISOString(), label: 'abandoned', last_heartbeat: null };
      state.lanes['2'] = { status: 'busy', holder: 'req-alive', acquired_at: new Date(now - 30*60000).toISOString(), label: 'working', last_heartbeat: new Date(now - 60000).toISOString() };
      const swept = laneLock.sweepStale(state);
      const fs = require('fs'), path = require('path');
      const log = fs.readFileSync(path.join(laneLock.LOCKS_DIR, 'stale-lane-alerts.log'), 'utf8').trim().split('\\n');
      console.log(JSON.stringify({
        lane1: swept.lanes['1'].status,
        lane2: swept.lanes['2'].status,
        lane2Holder: swept.lanes['2'].holder,
        logged: JSON.parse(log[log.length - 1]),
      }));
    `);
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.equal(out.lane1, 'free');
    assert.equal(out.lane2, 'busy');
    assert.equal(out.lane2Holder, 'req-alive');
    assert.equal(out.logged.lane, '1');
    assert.equal(out.logged.holder, 'req-stale');
  } finally {
    cleanup(project);
  }
});

test('sweepStale: promotes a queued request into a lane it frees', () => {
  const project = makeProject(THREE_LANES);
  try {
    const result = runInProject(project, `
      const now = Date.now();
      const state = laneLock.defaultState();
      state.lanes['1'] = { status: 'busy', holder: 'req-stale', acquired_at: new Date(now - 30*60000).toISOString(), label: 'abandoned', last_heartbeat: null };
      state.queue.push({ request_id: 'req-waiting', requested_at: new Date().toISOString(), label: 'next-in-line' });
      const swept = laneLock.sweepStale(state);
      console.log(JSON.stringify({ status: swept.lanes['1'].status, holder: swept.lanes['1'].holder, queue: swept.queue.length }));
    `);
    assert.equal(result.status, 0, result.stderr);
    const out = JSON.parse(result.stdout);
    assert.equal(out.status, 'busy');
    assert.equal(out.holder, 'req-waiting');
    assert.equal(out.queue, 0);
  } finally {
    cleanup(project);
  }
});

// --- reserve --------------------------------------------------------------------

test('reserve: takes the exact lane asked for and reports its four coupled values', () => {
  const project = makeProject(THREE_LANES);
  try {
    const res = runCli(project, ['reserve', '2', 'ci-job']);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.json.status, 'reserved');
    assert.equal(res.json.lane, '2');
    assert.equal(res.json.account, 'QA_USER2');
    assert.equal(res.json.storageState, '.auth/user-2.json');
    assert.equal(res.json.runnerProject, 'chromium-lane-2');
  } finally {
    cleanup(project);
  }
});

// reserve must never queue: a CI job that silently waits is a CI job that later runs
// on a lane nobody expected.
test('reserve: throws on a busy lane and does NOT queue', () => {
  const project = makeProject(THREE_LANES);
  try {
    assert.equal(runCli(project, ['reserve', '2', 'first']).status, 0);
    const second = runCli(project, ['reserve', '2', 'second']);
    assert.equal(second.status, 1);
    assert.match(second.stderr, /Lane 2 is already busy/);
    assert.match(second.stderr, /does not queue/);

    const status = runCli(project, ['status']);
    assert.equal(status.json.queue.length, 0);
  } finally {
    cleanup(project);
  }
});

test('reserve: throws on an undeclared lane', () => {
  const project = makeProject(THREE_LANES);
  try {
    const res = runCli(project, ['reserve', '99', 'x']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Unknown lane: 99/);
  } finally {
    cleanup(project);
  }
});

// --- acquire --------------------------------------------------------------------

test('acquire: takes a free lane and reports it', () => {
  const project = makeProject(THREE_LANES);
  try {
    const res = runCli(project, ['acquire', 'explorer']);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.json.status, 'acquired');
    assert.ok(['1', '2', '3'].includes(res.json.lane));
  } finally {
    cleanup(project);
  }
});

// The "6 accounts but only 3 MCP servers" failure: acquire must not hand out a lane
// that lacks a capability the consumer needs.
test('acquire --require-capability: only ever returns a lane declaring that capability', () => {
  const project = makeProject(THREE_LANES);
  try {
    // Lane 3 is the only free lane, and it has no 'mcp' capability.
    assert.equal(runCli(project, ['reserve', '1', 'held']).status, 0);
    assert.equal(runCli(project, ['reserve', '2', 'held']).status, 0);

    const res = runCli(project, ['acquire', 'needs-mcp', '--require-capability', 'mcp']);
    assert.equal(res.status, 0, res.stderr);
    // Lanes 1 and 2 are busy and lane 3 lacks the capability, so this queues rather
    // than handing back lane 3.
    assert.equal(res.json.status, 'queued');
  } finally {
    cleanup(project);
  }
});

test('acquire --require-capability: rejects when no lane declares the capability at all', () => {
  const project = makeProject(THREE_LANES);
  try {
    const res = runCli(project, ['acquire', 'x', '--require-capability', 'gpu']);
    assert.equal(res.json.status, 'rejected');
    assert.match(res.json.message, /No lane declares capability "gpu"/);
  } finally {
    cleanup(project);
  }
});

// --- queue cap ------------------------------------------------------------------

test('acquire: queues while under the cap, then rejects instead of overcommitting', () => {
  const project = makeProject(THREE_LANES);
  try {
    for (const id of ['1', '2', '3']) {
      assert.equal(runCli(project, ['reserve', id, 'held']).status, 0);
    }
    // Cap equals the lane count (3).
    for (let i = 1; i <= 3; i++) {
      const res = runCli(project, ['acquire', `queued-${i}`]);
      assert.equal(res.json.status, 'queued');
      assert.equal(res.json.position, i);
    }
    const overflow = runCli(project, ['acquire', 'one-too-many']);
    assert.equal(overflow.json.status, 'rejected');
    assert.match(overflow.json.message, /queue is already at its cap of 3/);
  } finally {
    cleanup(project);
  }
});

// --- release --------------------------------------------------------------------

test('release: frees the lane and promotes the head of the queue (FIFO)', () => {
  const project = makeProject(THREE_LANES);
  try {
    for (const id of ['1', '2', '3']) runCli(project, ['reserve', id, 'held']);
    runCli(project, ['acquire', 'first-waiter']);
    runCli(project, ['acquire', 'second-waiter']);

    const res = runCli(project, ['release', '2']);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.json.status, 'released');
    assert.equal(res.json.promoted.label, 'first-waiter');

    const status = runCli(project, ['status']);
    const lane2 = status.json.lanes.find((l) => l.lane === '2');
    assert.equal(lane2.status, 'busy');
    assert.equal(lane2.label, 'first-waiter');
    assert.equal(status.json.queue.length, 1);
  } finally {
    cleanup(project);
  }
});

test('release: frees a lane outright when the queue is empty', () => {
  const project = makeProject(THREE_LANES);
  try {
    runCli(project, ['reserve', '1', 'held']);
    const res = runCli(project, ['release', '1']);
    assert.equal(res.json.promoted, null);
    const status = runCli(project, ['status']);
    assert.equal(status.json.lanes.find((l) => l.lane === '1').status, 'free');
  } finally {
    cleanup(project);
  }
});

// --- heartbeat ------------------------------------------------------------------

test('heartbeat: sets last_heartbeat on a held lane', () => {
  const project = makeProject(THREE_LANES);
  try {
    runCli(project, ['reserve', '3', 'long-run']);
    const res = runCli(project, ['heartbeat', '3']);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.json.status, 'heartbeat-ok');
    assert.ok(res.json.last_heartbeat);

    const status = runCli(project, ['status']);
    assert.equal(status.json.lanes.find((l) => l.lane === '3').last_heartbeat, res.json.last_heartbeat);
  } finally {
    cleanup(project);
  }
});

// A heartbeat on a lane you do not hold is a bug in the caller, not something to
// swallow: swallowing it would let a dispatcher believe it was protecting a lane it
// had already lost.
test('heartbeat: throws on a free lane', () => {
  const project = makeProject(THREE_LANES);
  try {
    const res = runCli(project, ['heartbeat', '1']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Lane 1 is free/);
  } finally {
    cleanup(project);
  }
});

test('heartbeat: throws on an undeclared lane', () => {
  const project = makeProject(THREE_LANES);
  try {
    const res = runCli(project, ['heartbeat', '99']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /Unknown lane: 99/);
  } finally {
    cleanup(project);
  }
});

// --- lock directory precedence --------------------------------------------------

test('locks dir: defaults to a per-checkout .locks and says so on stderr', () => {
  const project = makeProject(THREE_LANES);
  try {
    const res = runCli(project, ['status']);
    assert.equal(res.json.locks_dir_source, 'default');
    assert.equal(res.json.locks_dir, path.join(project.e2e, '.locks'));
    assert.match(res.stderr, /locks dir:/);
    assert.match(res.stderr, /using per-checkout default/);
  } finally {
    cleanup(project);
  }
});

test('locks dir: the QA_LANE_LOCKS_DIR key in .env overrides the default', () => {
  const project = makeProject(THREE_LANES);
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lane-shared-'));
  try {
    fs.writeFileSync(
      path.join(project.e2e, '.env'),
      `QA_LANE_LOCKS_DIR=${shared}\nQA_USER_PASSWORD=SECRET_MUST_NOT_LEAK\n`,
      'utf8'
    );
    const res = runCli(project, ['status']);
    assert.equal(res.json.locks_dir_source, 'env-file');
    assert.equal(fs.realpathSync(res.json.locks_dir), fs.realpathSync(shared));
    assert.match(res.stderr, /read from \.env/);
  } finally {
    cleanup(project);
    fs.rmSync(shared, { recursive: true, force: true });
  }
});

test('locks dir: the shell environment wins over the .env key', () => {
  const project = makeProject(THREE_LANES);
  const fromEnvFile = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lane-envfile-'));
  const fromShell = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lane-shell-'));
  try {
    fs.writeFileSync(path.join(project.e2e, '.env'), `QA_LANE_LOCKS_DIR=${fromEnvFile}\n`, 'utf8');
    const res = runCli(project, ['status'], { QA_LANE_LOCKS_DIR: fromShell });
    assert.equal(res.json.locks_dir_source, 'shell');
    assert.equal(fs.realpathSync(res.json.locks_dir), fs.realpathSync(fromShell));
    assert.match(res.stderr, /set in shell environment/);
  } finally {
    cleanup(project);
    fs.rmSync(fromEnvFile, { recursive: true, force: true });
    fs.rmSync(fromShell, { recursive: true, force: true });
  }
});

// Reading .env must never pull the rest of the file into process.env. This is the
// least-privilege guarantee: a script whose only job is picking a directory must not
// gain ambient access to every QA account password in the same file.
// Two variants on purpose. WITH dotenv present, this pins that lane-lock calls
// parse() and never config() - switching to config() makes the other keys appear in
// process.env and fails here. WITHOUT dotenv, it pins that the fallback parser is
// equally narrow. Only running the second variant would prove nothing about the
// dotenv path, since a config() implementation would never be reached at all.
for (const withDotenv of [true, false]) {
  test(`locks dir: reading .env leaks no other key into process.env (dotenv ${withDotenv ? 'installed' : 'absent'})`, () => {
    const project = makeProject(THREE_LANES);
    const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lane-leak-'));
    try {
      if (withDotenv) installDotenvStub(project);
      fs.writeFileSync(
        path.join(project.e2e, '.env'),
        `QA_LANE_LOCKS_DIR=${shared}\nQA_USER_PASSWORD=SECRET_MUST_NOT_LEAK\nADO_PAT=ALSO_SECRET\n`,
        'utf8'
      );
      const result = runInProject(project, `
        console.log(JSON.stringify({
          password: process.env.QA_USER_PASSWORD ?? null,
          pat: process.env.ADO_PAT ?? null,
          source: laneLock.LOCKS_DIR_SOURCE,
          dotenvResolved: (() => { try { require.resolve('dotenv'); return true; } catch { return false; } })(),
        }));
      `);
      assert.equal(result.status, 0, result.stderr);
      const out = JSON.parse(result.stdout);
      assert.equal(out.dotenvResolved, withDotenv, 'the intended dotenv code path must be the one exercised');
      assert.equal(out.source, 'env-file', 'the .env key must actually have been read');
      assert.equal(out.password, null, 'QA_USER_PASSWORD leaked into process.env');
      assert.equal(out.pat, null, 'ADO_PAT leaked into process.env');
    } finally {
      cleanup(project);
      fs.rmSync(shared, { recursive: true, force: true });
    }
  });
}

// The whole reason QA_LANE_LOCKS_DIR exists: two checkouts sharing one lock dir must
// contend. Without it each gets its own state, every command reports success, and two
// sessions land on the same account with no error anywhere.
test('locks dir: two separate checkouts sharing one dir actually contend', () => {
  const a = makeProject(THREE_LANES);
  const b = makeProject(THREE_LANES);
  const shared = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lane-contend-'));
  try {
    const env = { QA_LANE_LOCKS_DIR: shared };

    assert.equal(runCli(a, ['reserve', '2', 'held-by-a'], env).status, 0);

    const statusFromB = runCli(b, ['status'], env);
    const lane2 = statusFromB.json.lanes.find((l) => l.lane === '2');
    assert.equal(lane2.status, 'busy');
    assert.equal(lane2.label, 'held-by-a');

    const conflict = runCli(b, ['reserve', '2', 'wanted-by-b'], env);
    assert.equal(conflict.status, 1);
    assert.match(conflict.stderr, /already busy/);
  } finally {
    cleanup(a);
    cleanup(b);
    fs.rmSync(shared, { recursive: true, force: true });
  }
});

// Negative control for the test above: proves the shared-dir test is measuring
// something real rather than passing for an unrelated reason.
test('locks dir: without a shared dir, two checkouts do NOT contend (the bug being prevented)', () => {
  const a = makeProject(THREE_LANES);
  const b = makeProject(THREE_LANES);
  try {
    assert.equal(runCli(a, ['reserve', '2', 'held-by-a']).status, 0);
    // Same lane, different checkout, per-checkout default lock dir: succeeds, which
    // is precisely the silent double-booking QA_LANE_LOCKS_DIR exists to stop.
    assert.equal(runCli(b, ['reserve', '2', 'also-held-by-b']).status, 0);
  } finally {
    cleanup(a);
    cleanup(b);
  }
});

// --- backward compatibility -----------------------------------------------------

test('a project with NO parallelLanes config gets one lane and the pre-lane storageState', () => {
  const project = makeProject({ project: { name: 'legacy' } });
  try {
    const res = runCli(project, ['status']);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.json.lanes.length, 1);
    assert.equal(res.json.lanes[0].lane, '1');
    assert.equal(res.json.lanes[0].account, 'QA_USER');
    assert.equal(res.json.lanes[0].storageState, '.auth/user-default.json');
    assert.equal(res.json.lanes[0].runnerProject, 'chromium');
  } finally {
    cleanup(project);
  }
});

test('a project with NO config file at all still resolves the single default lane', () => {
  const project = makeProject(undefined);
  try {
    const res = runCli(project, ['status']);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.json.lanes.length, 1);
    assert.equal(res.json.lanes[0].account, 'QA_USER');
  } finally {
    cleanup(project);
  }
});

test('single-lane project: the queue cap is 1, matching the lane count', () => {
  const project = makeProject({ project: { name: 'legacy' } });
  try {
    runCli(project, ['reserve', '1', 'held']);
    assert.equal(runCli(project, ['acquire', 'waiter']).json.status, 'queued');
    assert.equal(runCli(project, ['acquire', 'overflow']).json.status, 'rejected');
  } finally {
    cleanup(project);
  }
});

// --- state file resilience ------------------------------------------------------

test('loadState: a lane added to the config later is backfilled without disturbing held lanes', () => {
  const project = makeProject(THREE_LANES);
  try {
    runCli(project, ['reserve', '1', 'still-held']);

    // Add a fourth lane to the config, as a project would when provisioning another account.
    const grown = JSON.parse(JSON.stringify(THREE_LANES));
    grown.parallelLanes.lanes.push({
      id: '4', account: 'QA_USER4', storageState: '.auth/user-4.json', capabilities: [],
    });
    fs.writeFileSync(path.join(project.e2e, 'qa-framework.config.json'), JSON.stringify(grown), 'utf8');

    const res = runCli(project, ['status']);
    assert.equal(res.json.lanes.length, 4);
    const lane1 = res.json.lanes.find((l) => l.lane === '1');
    assert.equal(lane1.status, 'busy', 'a live hold must survive a config change');
    assert.equal(lane1.label, 'still-held');
    assert.equal(res.json.lanes.find((l) => l.lane === '4').status, 'free');
  } finally {
    cleanup(project);
  }
});

test('loadState: a corrupt state file falls back to a clean default rather than crashing', () => {
  const project = makeProject(THREE_LANES);
  try {
    const locks = path.join(project.e2e, '.locks');
    fs.mkdirSync(locks, { recursive: true });
    fs.writeFileSync(path.join(locks, 'lanes.json'), '{ not valid json', 'utf8');
    const res = runCli(project, ['status']);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(res.json.lanes.length, 3);
    assert.ok(res.json.lanes.every((l) => l.status === 'free'));
  } finally {
    cleanup(project);
  }
});

// --- CLI surface ----------------------------------------------------------------

test('CLI: an unknown command exits non-zero and documents acquire vs reserve', () => {
  const project = makeProject(THREE_LANES);
  try {
    const res = runCli(project, ['bogus']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /acquire/);
    assert.match(res.stderr, /reserve/);
    assert.match(res.stderr, /heartbeat/);
  } finally {
    cleanup(project);
  }
});

test('parseCapabilityFlag: accepts both --require-capability forms and keeps the label intact', () => {
  assert.deepEqual(
    laneLock.parseCapabilityFlag(['my', 'label', '--require-capability', 'mcp']),
    { capability: 'mcp', rest: ['my', 'label'] }
  );
  assert.deepEqual(
    laneLock.parseCapabilityFlag(['--require-capability=mcp', 'my', 'label']),
    { capability: 'mcp', rest: ['my', 'label'] }
  );
  assert.deepEqual(
    laneLock.parseCapabilityFlag(['plain', 'label']),
    { capability: null, rest: ['plain', 'label'] }
  );
});

test('parseSingleEnvKey: reads one key and ignores comments, blanks, quotes and other keys', () => {
  const contents = [
    '# a comment',
    '',
    'QA_USER_PASSWORD=secret',
    'export QA_LANE_LOCKS_DIR="/shared/locks"',
    'OTHER=value',
  ].join('\n');
  assert.equal(laneLock.parseSingleEnvKey(contents, 'QA_LANE_LOCKS_DIR'), '/shared/locks');
  assert.equal(laneLock.parseSingleEnvKey(contents, 'MISSING'), undefined);
});
