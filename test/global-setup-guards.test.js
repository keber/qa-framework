'use strict';

/**
 * Tests for the global-setup guards.
 *
 * The guards take an explicit env object and an injectable lane-lock module, which is
 * the whole reason they live in a CommonJS file instead of inside global-setup.ts:
 * they can be driven through a synthetic matrix here with `node --test`, without
 * ts-node and without touching real lock state.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const guards = require(path.join(
  __dirname, '..', 'templates', 'automation-scaffold', 'scripts', 'global-setup-guards.js'
));

/** A stand-in for lane-lock.js with a fixed lane table and lock state. */
function fakeLaneLock(laneStates) {
  const LANE_INFO = {
    '1': { account: 'QA_USER', storageState: '.auth/user-default.json', mcpNamespace: null, runnerProject: 'chromium-lane-1', capabilities: [] },
    '2': { account: 'QA_USER2', storageState: '.auth/user-2.json', mcpNamespace: null, runnerProject: 'chromium-lane-2', capabilities: [] },
    '3': { account: 'QA_USER3', storageState: '.auth/user-3.json', mcpNamespace: null, runnerProject: 'chromium-lane-3', capabilities: [] },
  };
  return {
    LANE_INFO,
    laneIdForQaLaneOnly(value) {
      if (value === 'default') return '1';
      if (LANE_INFO[value]) return value;
      throw new Error(`[lane-config] Invalid QA_LANE_ONLY: ${JSON.stringify(value)}.`);
    },
    loadState() {
      const lanes = {};
      for (const id of Object.keys(LANE_INFO)) {
        lanes[id] = laneStates && laneStates[id]
          ? laneStates[id]
          : { status: 'free', holder: null, acquired_at: null, label: null, last_heartbeat: null };
      }
      return { lanes, queue: [] };
    },
  };
}

const busy = { status: 'busy', holder: 'req-x', acquired_at: new Date().toISOString(), label: 'held', last_heartbeat: null };

// --- assertColdSetupIsIntentional -----------------------------------------------

// A cold setup re-logs in EVERY lane account, which invalidates any other session
// running against the shared QA server. It must never happen by accident.
test('assertColdSetupIsIntentional: throws when neither QA_LANE_ONLY nor QA_COLD_SETUP is set', () => {
  assert.throws(
    () => guards.assertColdSetupIsIntentional({}),
    /Refusing to run a cold setup/
  );
});

test('assertColdSetupIsIntentional: passes when QA_LANE_ONLY pins the run to one lane', () => {
  assert.doesNotThrow(() => guards.assertColdSetupIsIntentional({ QA_LANE_ONLY: '2' }));
});

test('assertColdSetupIsIntentional: passes only for the exact QA_COLD_SETUP=1 opt-in', () => {
  assert.doesNotThrow(() => guards.assertColdSetupIsIntentional({ QA_COLD_SETUP: '1' }));
  assert.throws(() => guards.assertColdSetupIsIntentional({ QA_COLD_SETUP: 'true' }), /Refusing to run a cold setup/);
  assert.throws(() => guards.assertColdSetupIsIntentional({ QA_COLD_SETUP: '0' }), /Refusing to run a cold setup/);
});

// --- assertLaneIsLocked ---------------------------------------------------------

test('assertLaneIsLocked: passes when the lane is actually held', () => {
  assert.doesNotThrow(
    () => guards.assertLaneIsLocked('2', {}, fakeLaneLock({ '2': busy }))
  );
});

// The point of the guard: a run that never reserved its lane must not log in.
test('assertLaneIsLocked: throws when the lane is not held', () => {
  assert.throws(
    () => guards.assertLaneIsLocked('2', {}, fakeLaneLock({})),
    /lane 2\) is not reserved/
  );
});

// The locks dir is local and per-machine, so a CI agent's fresh state would never
// show the lane busy and the guard would fail every CI run.
test('assertLaneIsLocked: is skipped in CI', () => {
  assert.doesNotThrow(
    () => guards.assertLaneIsLocked('2', { CI: 'true' }, fakeLaneLock({}))
  );
});

test('assertLaneIsLocked: propagates an unknown lane id rather than passing silently', () => {
  assert.throws(
    () => guards.assertLaneIsLocked('99', {}, fakeLaneLock({})),
    /Invalid QA_LANE_ONLY/
  );
});

// --- selectedProjectNamesFromArgv -----------------------------------------------

test('selectedProjectNamesFromArgv: parses both --project forms, including repeats', () => {
  assert.deepEqual(
    guards.selectedProjectNamesFromArgv(['node', 'pw', '--project=chromium-lane-1']),
    ['chromium-lane-1']
  );
  assert.deepEqual(
    guards.selectedProjectNamesFromArgv(['node', 'pw', '--project', 'chromium-lane-2']),
    ['chromium-lane-2']
  );
  assert.deepEqual(
    guards.selectedProjectNamesFromArgv(['node', 'pw', '--project=a', '--project', 'b']),
    ['a', 'b']
  );
});

test('selectedProjectNamesFromArgv: returns nothing when no --project is passed', () => {
  assert.deepEqual(guards.selectedProjectNamesFromArgv(['node', 'pw', '--headed']), []);
});

// --- assertProjectsMatchLane ----------------------------------------------------

const PROJECTS = [
  { name: 'setup', use: {} },
  { name: 'chromium-lane-1', use: { storageState: '.auth/user-default.json' } },
  { name: 'chromium-lane-2', use: { storageState: '.auth/user-2.json' } },
  { name: 'chromium-lane-3', use: { storageState: '.auth/user-3.json' } },
];

test('assertProjectsMatchLane: passes when the project storageState matches the lane', () => {
  assert.doesNotThrow(() => guards.assertProjectsMatchLane(
    '2', PROJECTS, ['node', 'pw', '--project=chromium-lane-2'], fakeLaneLock()
  ));
});

// This is the mismatch that produced real evidence corruption: a run reserved one
// lane while the project drove another account's session.
test('assertProjectsMatchLane: throws when the project belongs to a different lane', () => {
  assert.throws(
    () => guards.assertProjectsMatchLane('2', PROJECTS, ['node', 'pw', '--project=chromium-lane-3'], fakeLaneLock()),
    /does not match the storageState of the --project/
  );
});

// Without --project, Playwright runs EVERY project, most pointing at other lanes.
test('assertProjectsMatchLane: throws when QA_LANE_ONLY is set but no --project was passed', () => {
  assert.throws(
    () => guards.assertProjectsMatchLane('2', PROJECTS, ['node', 'pw'], fakeLaneLock()),
    /no --project was passed/
  );
});

test('assertProjectsMatchLane: throws on a --project that does not exist', () => {
  assert.throws(
    () => guards.assertProjectsMatchLane('2', PROJECTS, ['node', 'pw', '--project=typo'], fakeLaneLock()),
    /does not match any project declared/
  );
});

// A project with no string storageState does not authenticate against any lane, so
// there is nothing to compare and it must not trip the guard.
test('assertProjectsMatchLane: ignores projects without a string storageState', () => {
  assert.doesNotThrow(() => guards.assertProjectsMatchLane(
    '2', PROJECTS, ['node', 'pw', '--project=setup', '--project=chromium-lane-2'], fakeLaneLock()
  ));
});

test('assertProjectsMatchLane: does nothing on the cold-setup path', () => {
  assert.doesNotThrow(() => guards.assertProjectsMatchLane(
    undefined, PROJECTS, ['node', 'pw'], fakeLaneLock()
  ));
});

test('assertProjectsMatchLane: names the lane the mismatched storageState belongs to', () => {
  assert.throws(
    () => guards.assertProjectsMatchLane('1', PROJECTS, ['node', 'pw', '--project=chromium-lane-3'], fakeLaneLock()),
    /belongs to lane 3, not lane 1/
  );
});
