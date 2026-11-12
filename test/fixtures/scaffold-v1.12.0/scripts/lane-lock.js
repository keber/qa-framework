#!/usr/bin/env node
'use strict';

/**
 * Lane lock manager for the parallel QA lanes declared in qa-framework.config.json
 * (parallelLanes.lanes). The lane TABLE comes from lane-config.js; this file owns the
 * lane STATE - which lanes are currently held, by whom, and since when.
 *
 * WHY THIS EXISTS: the applications under test invalidate a session when the same
 * account logs in again. Two workers sharing one QA account silently destroy each
 * other's session, and the damage shows up later as an unexplained logout or, worse,
 * as evidence recorded under the wrong account. The lock is what guarantees one
 * worker per account.
 *
 * State lives in <locks-dir>/lanes.json, guarded by a mkdir-based mutex
 * (<locks-dir>/.mutex/), so concurrent acquire/release calls never race on the file.
 * mkdir is used because it is atomic on every platform this runs on, needs no
 * dependency, and leaves a visible artifact if a process dies mid-hold.
 *
 * LOCK DIRECTORY (QA_LANE_LOCKS_DIR), three sources in precedence order:
 *   1. shell environment
 *   2. the QA_LANE_LOCKS_DIR key in .env
 *   3. per-checkout default (<scripts>/../.locks)
 *
 * The default preserves single-checkout behavior exactly, so this is not a breaking
 * change. Setting it matters when sessions run from separate git worktrees: each
 * worktree is an independent filesystem, so with the per-checkout default each one
 * gets its OWN .locks/lanes.json and they never contend. Every status reports free
 * lanes, every acquire succeeds, and the collision only surfaces later as an
 * invalidated session. The failure is silent and looks exactly like success.
 *
 * That is why every CLI invocation logs the effective lock directory AND which of the
 * three sources it came from to stderr. Given a silent failure mode, being able to
 * answer "which lock directory is this session actually using" from the outside is
 * part of the fix, not a nicety.
 *
 * The .env value is read with dotenv.parse(), NOT dotenv.config(). parse() returns a
 * plain object and never touches process.env, so this script only ever sees this one
 * key. config() would inject the WHOLE .env - every QA account password and any ADO
 * token living in it - into a process whose only job is deciding where to write a
 * JSON state file, where any dependency, crash dump or child process inherits them.
 * Do not "simplify" this back to config(); it looks like harmless cleanup and is not.
 *
 * Usage:
 *   node lane-lock.js acquire "<label>"
 *   node lane-lock.js acquire "<label>" --require-capability mcp
 *   node lane-lock.js reserve <laneId> "<label>"
 *   node lane-lock.js release <lane>
 *   node lane-lock.js force-release <lane>
 *   node lane-lock.js heartbeat <lane>
 *   node lane-lock.js status
 *
 * acquire vs reserve (do not collapse them into one verb):
 *   - `acquire` picks a RANDOM free lane and queues when none are free. Correct for
 *     dispatching a worker that does not care which lane it gets.
 *   - `reserve <laneId>` takes an EXACT lane id, has NO queue, and throws hard if
 *     that lane is busy. Correct for a CI job or a local `playwright test` run, which
 *     needs a specific predictable lane matching its QA_LANE_ONLY and storageState.
 *   Collapsing them is how a CI job ends up on a random lane.
 *
 * HEARTBEAT: a held lane is swept as stale only if it has been held past the
 * threshold AND (it never sent a heartbeat OR its last heartbeat is itself past the
 * threshold). A recent heartbeat proves the holder is alive, so such a lane is never
 * swept regardless of how old the acquisition is. Per docs/decisions/
 * lane-heartbeat-caller.md the DISPATCHER calls heartbeat from its own wait loop -
 * the executor is not required to and must not be relied upon to. A liveness
 * protocol that depends on an uninstructed party is not a control.
 */

const fs = require('fs');
const path = require('path');

const laneConfig = require('./lane-config.js');

// Minimal single-key reader used when dotenv is not installed.
//
// dotenv is a devDependency of the generated project, so `node scripts/lane-lock.js`
// can legitimately run before `npm install`. Silently ignoring .env in that case
// would be the worst option available: the lock directory would quietly fall back to
// the per-checkout default while the operator believes the shared one is in use,
// which is exactly the silent zero-contention failure this whole mechanism exists to
// prevent. So parse the one key by hand instead. It handles the forms dotenv does
// that matter here (comments, blank lines, surrounding quotes, `export ` prefix) and
// deliberately nothing more.
function parseSingleEnvKey(contents, key) {
  for (const rawLine of String(contents).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue;
    if (withoutExport.slice(0, eq).trim() !== key) continue;
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    return value || undefined;
  }
  return undefined;
}

// Read ONLY this one key. See the dotenv note in the header comment above; this is a
// least-privilege decision, not a style choice. dotenv.parse() returns a plain object
// and never touches process.env, so no other key in .env is ever loaded.
function readLocksDirFromEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return undefined;
  const contents = fs.readFileSync(envPath);
  try {
    return require('dotenv').parse(contents).QA_LANE_LOCKS_DIR;
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND') return parseSingleEnvKey(contents, 'QA_LANE_LOCKS_DIR');
    throw err;
  }
}

function resolveLocksDir() {
  if (process.env.QA_LANE_LOCKS_DIR) {
    return { dir: path.resolve(process.env.QA_LANE_LOCKS_DIR), source: 'shell' };
  }
  const fromEnvFile = readLocksDirFromEnvFile();
  if (fromEnvFile) {
    return { dir: path.resolve(fromEnvFile), source: 'env-file' };
  }
  return { dir: path.join(__dirname, '..', '.locks'), source: 'default' };
}

const LOCKS = resolveLocksDir();
const LOCKS_DIR = LOCKS.dir;
const LOCKS_DIR_SOURCE = LOCKS.source;
const STATE_FILE = path.join(LOCKS_DIR, 'lanes.json');
const MUTEX_DIR = path.join(LOCKS_DIR, '.mutex');
const STALE_MINUTES = Number(process.env.QA_LANE_STALE_MINUTES || 20);

const LANE_INFO = laneConfig.loadLaneTable();

// The queue is capped at the lane count: a queue longer than the number of lanes
// means work is piling up faster than lanes can drain it, and the correct answer is
// to reject and let the caller back off, never to force a lane assignment past the
// cap.
const MAX_QUEUE = Object.keys(LANE_INFO).length;

function freeLane() {
  return { status: 'free', holder: null, acquired_at: null, label: null, last_heartbeat: null };
}

function defaultState() {
  const lanes = {};
  for (const id of Object.keys(LANE_INFO)) lanes[id] = freeLane();
  return { lanes, queue: [] };
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return defaultState();
  let state;
  try {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return defaultState();
  }
  if (!state || typeof state !== 'object') return defaultState();
  if (!state.lanes || typeof state.lanes !== 'object') state.lanes = {};
  if (!Array.isArray(state.queue)) state.queue = [];

  // Backfill lanes added to the config since this lanes.json was written, and any
  // lane missing last_heartbeat. Both loops only ADD - they never reset a lane that
  // is already busy from a live session, because doing so would free an account
  // someone is actively driving.
  for (const id of Object.keys(LANE_INFO)) {
    if (!state.lanes[id]) state.lanes[id] = freeLane();
  }
  for (const id of Object.keys(state.lanes)) {
    if (!('last_heartbeat' in state.lanes[id])) state.lanes[id].last_heartbeat = null;
  }
  return state;
}

function saveState(state) {
  fs.mkdirSync(LOCKS_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function acquireMutex() {
  fs.mkdirSync(LOCKS_DIR, { recursive: true });
  const maxTries = 50; // ~5s worst case
  for (let i = 0; i < maxTries; i++) {
    try {
      fs.mkdirSync(MUTEX_DIR);
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      sleepSync(100);
    }
  }
  throw new Error(
    `[lane-lock] Could not take the lanes.json mutex at ${MUTEX_DIR} after 5s. ` +
    'If no other lane-lock process is running, remove that directory and retry.'
  );
}

function releaseMutex() {
  try { fs.rmdirSync(MUTEX_DIR); } catch { /* already released */ }
}

function withMutex(fn) {
  acquireMutex();
  try {
    return fn();
  } finally {
    releaseMutex();
  }
}

function genRequestId() {
  return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

function laneIdForQaLaneOnly(qaLaneOnly) {
  return laneConfig.laneIdForQaLaneOnly(qaLaneOnly, LANE_INFO);
}

function storageStateForLaneOnly(qaLaneOnly) {
  return laneConfig.storageStateForLaneOnly(qaLaneOnly, LANE_INFO);
}

/**
 * Composite staleness predicate. A busy lane is stale only when it has been held for
 * >= STALE_MINUTES AND it either never sent a heartbeat OR its last heartbeat is
 * itself >= STALE_MINUTES old.
 *
 * Age alone is a bad liveness signal: a lane legitimately held for a long-running
 * investigation looks identical to one abandoned by a crashed process. The heartbeat
 * is what distinguishes them, so a lane with a recent heartbeat is never stale no
 * matter how old the acquisition is.
 */
function isLaneStale(laneState, now, staleMinutes) {
  const threshold = staleMinutes === undefined ? STALE_MINUTES : staleMinutes;
  if (!laneState || laneState.status !== 'busy' || !laneState.acquired_at) return false;
  const ageMinutes = (now - new Date(laneState.acquired_at).getTime()) / 60000;
  if (ageMinutes < threshold) return false;
  if (laneState.last_heartbeat === null || laneState.last_heartbeat === undefined) return true;
  const heartbeatAgeMinutes = (now - new Date(laneState.last_heartbeat).getTime()) / 60000;
  return heartbeatAgeMinutes >= threshold;
}

function promoteQueueInto(state, laneId) {
  if (state.queue.length === 0) return null;
  const next = state.queue.shift();
  state.lanes[laneId] = {
    status: 'busy',
    holder: next.request_id,
    acquired_at: new Date().toISOString(),
    label: next.label,
    last_heartbeat: null,
  };
  return next;
}

/**
 * Frees every stale lane (composite predicate above), promotes the queue into each,
 * and appends one JSON line per freed lane to <locks-dir>/stale-lane-alerts.log.
 *
 * The log is not optional: a swept lane means the mechanism overrode a holder that
 * may still have been alive, which is exactly the situation that needs an audit trail
 * after the fact. Mutates and returns `state`; callers save it (called lazily inside
 * withMutex at the start of acquire/reserve/status).
 */
function sweepStale(state) {
  const now = Date.now();
  const released = [];

  for (const laneId of Object.keys(state.lanes)) {
    const laneState = state.lanes[laneId];
    if (!isLaneStale(laneState, now)) continue;

    released.push({
      timestamp: new Date().toISOString(),
      lane: laneId,
      holder: laneState.holder,
      label: laneState.label,
      acquired_at: laneState.acquired_at,
      last_heartbeat: laneState.last_heartbeat,
    });

    state.lanes[laneId] = freeLane();
    promoteQueueInto(state, laneId);
  }

  if (released.length > 0) {
    fs.mkdirSync(LOCKS_DIR, { recursive: true });
    const logFile = path.join(LOCKS_DIR, 'stale-lane-alerts.log');
    fs.appendFileSync(logFile, released.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  }

  return state;
}

/**
 * Takes a RANDOM free lane, queueing when none are free and rejecting when the queue
 * is at the cap.
 *
 * `requireCapability` narrows the candidate lanes to those declaring it. This is the
 * guard for the "6 accounts but only 3 MCP servers" case: without it, acquire happily
 * hands out a CLI-only lane to a consumer that needs MCP tools, which fails later and
 * confusingly inside the consumer.
 */
function cmdAcquire(label, requireCapability) {
  return withMutex(() => {
    const state = sweepStale(loadState());

    const eligible = Object.keys(state.lanes).filter((id) => {
      if (!LANE_INFO[id]) return false; // in state but no longer in config
      if (!requireCapability) return true;
      return LANE_INFO[id].capabilities.includes(requireCapability);
    });

    if (eligible.length === 0) {
      return {
        status: 'rejected',
        message: requireCapability
          ? `No lane declares capability "${requireCapability}".`
          : 'No lanes are declared in parallelLanes.lanes.',
      };
    }

    const free = eligible.filter((id) => state.lanes[id].status === 'free');
    if (free.length > 0) {
      const chosen = free[Math.floor(Math.random() * free.length)];
      const requestId = genRequestId();
      state.lanes[chosen] = {
        status: 'busy',
        holder: requestId,
        acquired_at: new Date().toISOString(),
        label: label || null,
        last_heartbeat: null,
      };
      saveState(state);
      return { status: 'acquired', lane: chosen, request_id: requestId, ...LANE_INFO[chosen] };
    }

    if (state.queue.length < MAX_QUEUE) {
      const requestId = genRequestId();
      state.queue.push({
        request_id: requestId,
        requested_at: new Date().toISOString(),
        label: label || null,
        require_capability: requireCapability || null,
      });
      saveState(state);
      return { status: 'queued', request_id: requestId, position: state.queue.length };
    }

    return {
      status: 'rejected',
      message:
        `No free lane and the queue is already at its cap of ${MAX_QUEUE}. Retry later. ` +
        'Never force a lane assignment past the cap: that puts two workers on one account.',
    };
  });
}

/**
 * Reserves an EXACT lane id. No random pick, no queue, throws hard if the lane is
 * busy or unknown. Callers needing a specific predictable lane (local CLI runs, CI
 * jobs) must use this instead of acquire.
 */
function cmdReserve(laneId, label) {
  return withMutex(() => {
    const state = sweepStale(loadState());
    if (!state.lanes[laneId] || !LANE_INFO[laneId]) {
      throw new Error(
        `[lane-lock] Unknown lane: ${laneId}. Declared lanes: ${Object.keys(LANE_INFO).join(', ')}.`
      );
    }
    const laneState = state.lanes[laneId];
    if (laneState.status === 'busy') {
      throw new Error(
        `[lane-lock] Lane ${laneId} is already busy (holder: ${laneState.holder}, label: ${laneState.label}). ` +
        'reserve does not queue - use acquire if you need to wait for a free lane.'
      );
    }

    const requestId = genRequestId();
    state.lanes[laneId] = {
      status: 'busy',
      holder: requestId,
      acquired_at: new Date().toISOString(),
      label: label || null,
      last_heartbeat: null,
    };
    saveState(state);
    return { status: 'reserved', lane: laneId, request_id: requestId, ...LANE_INFO[laneId] };
  });
}

function cmdRelease(lane) {
  return withMutex(() => {
    const state = loadState();
    if (!state.lanes[lane]) {
      throw new Error(
        `[lane-lock] Unknown lane: ${lane}. Declared lanes: ${Object.keys(LANE_INFO).join(', ')}.`
      );
    }

    state.lanes[lane] = freeLane();
    const promoted = promoteQueueInto(state, lane);
    saveState(state);

    return {
      status: 'released',
      lane,
      promoted,
      ...(promoted ? { promoted_lane_info: LANE_INFO[lane] } : {}),
    };
  });
}

/**
 * Refreshes last_heartbeat on a busy lane, proving the holder is still alive.
 * Throws on an unknown or free lane: a heartbeat on a lane you do not hold is a bug
 * in the caller, not something to swallow.
 */
function cmdHeartbeat(lane) {
  return withMutex(() => {
    const state = loadState();
    if (!state.lanes[lane]) {
      throw new Error(
        `[lane-lock] Unknown lane: ${lane}. Declared lanes: ${Object.keys(LANE_INFO).join(', ')}.`
      );
    }
    if (state.lanes[lane].status !== 'busy') {
      throw new Error(
        `[lane-lock] Lane ${lane} is free - cannot heartbeat a lane that is not reserved or acquired.`
      );
    }
    state.lanes[lane].last_heartbeat = new Date().toISOString();
    saveState(state);
    return { status: 'heartbeat-ok', lane, last_heartbeat: state.lanes[lane].last_heartbeat };
  });
}

function cmdStatus() {
  return withMutex(() => {
    const state = sweepStale(loadState());
    saveState(state);
    const now = Date.now();
    const lanes = Object.keys(state.lanes).map((id) => {
      const l = state.lanes[id];
      const info = LANE_INFO[id] || {};
      return {
        lane: id,
        account: info.account || null,
        storageState: info.storageState || null,
        mcpNamespace: info.mcpNamespace || null,
        runnerProject: info.runnerProject || null,
        capabilities: info.capabilities || [],
        status: l.status,
        holder: l.holder,
        label: l.label,
        age_minutes: l.acquired_at ? Math.round((now - new Date(l.acquired_at).getTime()) / 60000) : null,
        last_heartbeat: l.last_heartbeat,
        stale: isLaneStale(l, now),
      };
    });
    return { locks_dir: LOCKS_DIR, locks_dir_source: LOCKS_DIR_SOURCE, lanes, queue: state.queue };
  });
}

// Part of the fix, not a nicety: the underlying misconfiguration (each worktree
// silently using its own lock directory) produces no error at all, so the only way to
// tell a correctly configured session from a broken one is to state the answer.
function logLocksDir() {
  const explain = {
    shell: 'QA_LANE_LOCKS_DIR set in shell environment',
    'env-file': 'QA_LANE_LOCKS_DIR read from .env',
    default: 'QA_LANE_LOCKS_DIR not set in shell environment or .env, using per-checkout default',
  };
  console.error(`[lane-lock] locks dir: ${LOCKS_DIR} (source: ${explain[LOCKS_DIR_SOURCE]})`);
}

function parseCapabilityFlag(args) {
  const rest = [];
  let capability = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--require-capability') {
      capability = args[i + 1];
      if (!capability) throw new Error('[lane-lock] --require-capability needs a value.');
      i++;
      continue;
    }
    if (args[i].startsWith('--require-capability=')) {
      capability = args[i].slice('--require-capability='.length);
      if (!capability) throw new Error('[lane-lock] --require-capability needs a value.');
      continue;
    }
    rest.push(args[i]);
  }
  return { capability, rest };
}

function main() {
  logLocksDir();
  const [, , cmd, ...rawArgs] = process.argv;
  const { capability, rest: args } = parseCapabilityFlag(rawArgs);
  let result;

  switch (cmd) {
    case 'acquire':
      result = cmdAcquire(args.join(' '), capability);
      break;
    case 'reserve':
      if (!args[0]) throw new Error('[lane-lock] Usage: lane-lock.js reserve <laneId> "<label>"');
      result = cmdReserve(args[0], args.slice(1).join(' '));
      break;
    case 'release':
    case 'force-release':
      if (!args[0]) throw new Error('[lane-lock] Usage: lane-lock.js release <lane>');
      result = cmdRelease(args[0]);
      break;
    case 'heartbeat':
      if (!args[0]) throw new Error('[lane-lock] Usage: lane-lock.js heartbeat <lane>');
      result = cmdHeartbeat(args[0]);
      break;
    case 'status':
      result = cmdStatus();
      break;
    default:
      console.error(
        'Commands: acquire <label> [--require-capability <cap>] | reserve <laneId> <label> |\n' +
        '          release <lane> | force-release <lane> | heartbeat <lane> | status\n' +
        '  acquire   - random free lane, queues when none are free. For workers that do not\n' +
        '              care which lane they get.\n' +
        '  reserve   - exact lane id, no queue, throws if busy. For CI jobs and local CLI runs\n' +
        '              that need a specific predictable lane.\n' +
        '  release   - free a lane (promotes the next queued request if any).\n' +
        '  heartbeat - refresh last_heartbeat on a lane you currently hold. The dispatcher\n' +
        '              calls this from its wait loop, not the executor.\n' +
        '  status    - snapshot of all lanes and the queue (also sweeps stale lanes).'
      );
      process.exit(1);
      return;
  }
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = {
  LANE_INFO,
  LOCKS_DIR,
  LOCKS_DIR_SOURCE,
  STATE_FILE,
  STALE_MINUTES,
  MAX_QUEUE,
  defaultState,
  loadState,
  saveState,
  withMutex,
  acquireMutex,
  releaseMutex,
  genRequestId,
  laneIdForQaLaneOnly,
  storageStateForLaneOnly,
  isLaneStale,
  sweepStale,
  cmdAcquire,
  cmdReserve,
  cmdRelease,
  cmdHeartbeat,
  cmdStatus,
  parseCapabilityFlag,
  parseSingleEnvKey,
  resolveLocksDir,
  readLocksDirFromEnvFile,
};
