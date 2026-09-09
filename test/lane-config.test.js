'use strict';

/**
 * Tests for the lane TABLE: config parsing, lane resolution, storageState resolution,
 * and the per-lane capability model.
 *
 * lane-config.js is pure with respect to the lock state (it never reads or writes
 * lanes.json), so every case here can pass a literal config object.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SCAFFOLD_SCRIPTS = path.join(
  __dirname, '..', 'templates', 'automation-scaffold', 'scripts'
);
const laneConfig = require(path.join(SCAFFOLD_SCRIPTS, 'lane-config.js'));

function threeLaneConfig() {
  return {
    parallelLanes: {
      enabled: true,
      lanes: [
        { id: '1', account: 'QA_USER', storageState: '.auth/user-default.json', mcpNamespace: 'mcp__pw1__', runnerProject: 'chromium-lane-1', capabilities: ['mcp'] },
        { id: '2', account: 'QA_USER2', storageState: '.auth/user-2.json', mcpNamespace: 'mcp__pw2__', runnerProject: 'chromium-lane-2', capabilities: ['mcp'] },
        { id: '3', account: 'QA_USER3', storageState: '.auth/user-3.json', runnerProject: 'chromium-lane-3' },
      ],
    },
  };
}

// --- Backward compatibility -----------------------------------------------------

test('laneTableFromConfig: no parallelLanes block yields the single implicit default lane', () => {
  const table = laneConfig.laneTableFromConfig({ project: { name: 'x' } });
  assert.deepEqual(Object.keys(table), ['1']);
  assert.equal(table['1'].account, 'QA_USER');
  assert.equal(table['1'].storageState, '.auth/user-default.json');
  assert.equal(table['1'].runnerProject, 'chromium');
});

test('laneTableFromConfig: enabled:false behaves exactly like no block at all', () => {
  const disabled = laneConfig.laneTableFromConfig({
    parallelLanes: { enabled: false, lanes: [
      { id: 'a', account: 'QA_A', storageState: '.auth/a.json' },
      { id: 'b', account: 'QA_B', storageState: '.auth/b.json' },
    ] },
  });
  assert.deepEqual(disabled, laneConfig.laneTableFromConfig({}));
});

test('laneTableFromConfig: an entirely absent config still resolves the default lane', () => {
  assert.deepEqual(Object.keys(laneConfig.laneTableFromConfig(undefined)), ['1']);
  assert.deepEqual(Object.keys(laneConfig.laneTableFromConfig(null)), ['1']);
});

test('storageStateForLaneOnly: default lane keeps the pre-lane storageState path', () => {
  const table = laneConfig.laneTableFromConfig({});
  assert.equal(laneConfig.storageStateForLaneOnly('default', table), '.auth/user-default.json');
  assert.equal(laneConfig.storageStateForLaneOnly('1', table), '.auth/user-default.json');
});

// --- Config parsing -------------------------------------------------------------

test('laneTableFromConfig: parses a three-lane table with all four coupled values', () => {
  const table = laneConfig.laneTableFromConfig(threeLaneConfig());
  assert.deepEqual(Object.keys(table), ['1', '2', '3']);
  assert.equal(table['2'].account, 'QA_USER2');
  assert.equal(table['2'].storageState, '.auth/user-2.json');
  assert.equal(table['2'].mcpNamespace, 'mcp__pw2__');
  assert.equal(table['2'].runnerProject, 'chromium-lane-2');
});

test('laneTableFromConfig: optional mcpNamespace and runnerProject normalize to null', () => {
  const table = laneConfig.laneTableFromConfig({
    parallelLanes: { lanes: [{ id: '1', account: 'QA_USER', storageState: '.auth/a.json' }] },
  });
  assert.equal(table['1'].mcpNamespace, null);
  assert.equal(table['1'].runnerProject, null);
  assert.deepEqual(table['1'].capabilities, []);
});

test('laneTableFromConfig: rejects a lane missing account or storageState', () => {
  assert.throws(
    () => laneConfig.laneTableFromConfig({ parallelLanes: { lanes: [{ id: '1', account: 'QA_USER' }] } }),
    /storageState is required/
  );
  assert.throws(
    () => laneConfig.laneTableFromConfig({ parallelLanes: { lanes: [{ id: '1', storageState: '.auth/a.json' }] } }),
    /account is required/
  );
});

test('laneTableFromConfig: rejects a malformed or missing lane id', () => {
  assert.throws(
    () => laneConfig.laneTableFromConfig({ parallelLanes: { lanes: [{ account: 'A', storageState: 's' }] } }),
    /id must be a non-empty string/
  );
  assert.throws(
    () => laneConfig.laneTableFromConfig({ parallelLanes: { lanes: [{ id: 'has space', account: 'A', storageState: 's' }] } }),
    /id must be a non-empty string/
  );
});

test('laneTableFromConfig: rejects duplicate lane ids', () => {
  assert.throws(
    () => laneConfig.laneTableFromConfig({ parallelLanes: { lanes: [
      { id: '1', account: 'A', storageState: '.auth/a.json' },
      { id: '1', account: 'B', storageState: '.auth/b.json' },
    ] } }),
    /duplicate lane id/
  );
});

// Two lanes sharing a storageState are not isolated at all - they write the same
// session file. Silently allowing it would defeat the entire point of lanes.
test('laneTableFromConfig: rejects two lanes sharing one storageState', () => {
  assert.throws(
    () => laneConfig.laneTableFromConfig({ parallelLanes: { lanes: [
      { id: '1', account: 'A', storageState: '.auth/same.json' },
      { id: '2', account: 'B', storageState: '.auth/same.json' },
    ] } }),
    /share storageState/
  );
});

test('laneTableFromConfig: rejects an empty or non-array lanes list', () => {
  assert.throws(() => laneConfig.laneTableFromConfig({ parallelLanes: { lanes: [] } }), /non-empty array/);
  assert.throws(() => laneConfig.laneTableFromConfig({ parallelLanes: { lanes: 'nope' } }), /non-empty array/);
});

test('laneTableFromConfig: rejects non-string capabilities', () => {
  assert.throws(
    () => laneConfig.laneTableFromConfig({ parallelLanes: { lanes: [
      { id: '1', account: 'A', storageState: 's', capabilities: [42] },
    ] } }),
    /capabilities must be an array of non-empty strings/
  );
});

// --- Lane resolution ------------------------------------------------------------

test('laneIdForQaLaneOnly: "default" resolves to the first declared lane', () => {
  const table = laneConfig.laneTableFromConfig({
    parallelLanes: { lanes: [
      { id: 'alpha', account: 'A', storageState: '.auth/a.json' },
      { id: 'beta', account: 'B', storageState: '.auth/b.json' },
    ] },
  });
  assert.equal(laneConfig.laneIdForQaLaneOnly('default', table), 'alpha');
});

test('laneIdForQaLaneOnly: an explicit lane id resolves to itself', () => {
  const table = laneConfig.laneTableFromConfig(threeLaneConfig());
  for (const id of ['1', '2', '3']) {
    assert.equal(laneConfig.laneIdForQaLaneOnly(id, table), id);
  }
});

// Guessing a lane is how a run drives an account it does not hold, so an
// unrecognized value must throw rather than fall back.
test('laneIdForQaLaneOnly: throws on an undeclared lane instead of guessing', () => {
  const table = laneConfig.laneTableFromConfig(threeLaneConfig());
  assert.throws(() => laneConfig.laneIdForQaLaneOnly('4', table), /Invalid QA_LANE_ONLY/);
  assert.throws(() => laneConfig.laneIdForQaLaneOnly('', table), /Invalid QA_LANE_ONLY/);
  assert.throws(() => laneConfig.laneIdForQaLaneOnly(undefined, table), /Invalid QA_LANE_ONLY/);
});

// This is the exact failure mode the old scaffold had: it selected the account with
// storageState.includes('user-2'), and 'user-2' is a substring of 'user-20'.
test('storageStateForLaneOnly: resolves by exact lane id, not by substring matching', () => {
  const table = laneConfig.laneTableFromConfig({
    parallelLanes: { lanes: [
      { id: '2', account: 'QA_USER2', storageState: '.auth/user-2.json' },
      { id: '20', account: 'QA_USER20', storageState: '.auth/user-20.json' },
    ] },
  });
  assert.equal(laneConfig.storageStateForLaneOnly('2', table), '.auth/user-2.json');
  assert.equal(laneConfig.storageStateForLaneOnly('20', table), '.auth/user-20.json');
});

// --- Per-lane capabilities ------------------------------------------------------

test('lanesWithCapability: capabilities are per-lane, not a property of the set', () => {
  const table = laneConfig.laneTableFromConfig(threeLaneConfig());
  assert.deepEqual(laneConfig.lanesWithCapability('mcp', table), ['1', '2']);
  assert.deepEqual(laneConfig.lanesWithCapability('nonexistent', table), []);
});

test('assertLaneHasCapability: passes for a lane that declares it', () => {
  const table = laneConfig.laneTableFromConfig(threeLaneConfig());
  assert.doesNotThrow(() => laneConfig.assertLaneHasCapability('1', 'mcp', table));
});

// The real incident: 6 accounts but only 3 MCP servers, and lane 5 was handed to a
// consumer that needed MCP tools it did not have.
test('assertLaneHasCapability: throws for a lane lacking the capability, naming alternatives', () => {
  const table = laneConfig.laneTableFromConfig(threeLaneConfig());
  assert.throws(
    () => laneConfig.assertLaneHasCapability('3', 'mcp', table),
    /Lane 3 does not have capability "mcp".*Lanes with that capability: 1, 2/s
  );
});

test('assertLaneHasCapability: throws on an unknown lane', () => {
  const table = laneConfig.laneTableFromConfig(threeLaneConfig());
  assert.throws(() => laneConfig.assertLaneHasCapability('99', 'mcp', table), /Unknown lane/);
});

// --- Config file loading --------------------------------------------------------

test('loadLaneTable: reads a lane table from a config file on disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lane-cfg-'));
  try {
    const configPath = path.join(dir, 'qa-framework.config.json');
    fs.writeFileSync(configPath, JSON.stringify(threeLaneConfig()), 'utf8');
    const table = laneConfig.loadLaneTable(configPath);
    assert.deepEqual(Object.keys(table), ['1', '2', '3']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadLaneTable: a missing config file falls back to the default lane', () => {
  const table = laneConfig.loadLaneTable(path.join(os.tmpdir(), 'definitely-not-here.json'));
  assert.deepEqual(Object.keys(table), ['1']);
});

test('findConfigPath: locates qa-framework.config.json by walking up', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-lane-find-'));
  try {
    const nested = path.join(dir, 'qa', '07-automation', 'e2e');
    fs.mkdirSync(nested, { recursive: true });
    const configPath = path.join(dir, 'qa-framework.config.json');
    fs.writeFileSync(configPath, '{}', 'utf8');
    assert.equal(fs.realpathSync(laneConfig.findConfigPath(nested)), fs.realpathSync(configPath));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
