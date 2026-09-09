#!/usr/bin/env node
'use strict';

/**
 * Lane table resolution for the parallel QA lanes.
 *
 * WHY LANES EXIST: not for speed. The applications under test invalidate a session
 * when the same account logs in again, so two concurrent workers sharing one account
 * silently destroy each other's session. Each lane is a distinct QA account, and the
 * lock in lane-lock.js is what stops two workers landing on the same one.
 *
 * This module owns the lane TABLE (which lanes exist and what each one is bound to).
 * lane-lock.js owns the lane STATE (which lanes are currently held). Keeping them
 * apart means the table can be parsed and tested without touching the filesystem
 * state, and means playwright.config.ts can resolve a storageState without pulling
 * in the lock machinery.
 *
 * A lane is four coupled values, not just an account. All four come from config
 * because none of them can be reliably inferred:
 *
 *   account       env var prefix for credentials, e.g. QA_USER4 -> QA_USER4_EMAIL
 *   storageState  the Playwright storage state file for that account
 *   mcpNamespace  tool prefix when an agent drives this lane over Playwright MCP
 *   runnerProject the playwright.config.ts project name bound to this lane
 *
 * CAPABILITIES ARE PER-LANE, NOT PER-SET. A project can have 6 accounts but only 3
 * MCP servers. Handing lane 5 to a consumer that needs MCP tools lane 5 lacks is a
 * real failure that happened in production use, not a hypothetical. So each lane
 * declares its own capabilities and consumers state what they require; see
 * lanesWithCapability() and assertLaneHasCapability().
 *
 * BACKWARD COMPATIBILITY: a project with no `parallelLanes` block in its config gets
 * the implicit single default lane (lane '1', account QA_USER, storageState
 * .auth/user-default.json) - exactly the shape the pre-N-lane scaffold hardcoded.
 * See DEFAULT_LANE_TABLE below.
 */

const fs = require('fs');
const path = require('path');

// The implicit lane table used when a project declares no `parallelLanes` config.
// These values match what the single-lane scaffold used before lanes were
// configurable: one lane, QA_USER credentials, .auth/user-default.json, the
// 'chromium' project. A project that never opts in must keep behaving exactly as it
// did, so this table is not merely a nice default - it is the compatibility contract.
const DEFAULT_LANE_TABLE = Object.freeze({
  '1': Object.freeze({
    account: 'QA_USER',
    storageState: '.auth/user-default.json',
    mcpNamespace: null,
    runnerProject: 'chromium',
    capabilities: Object.freeze([]),
  }),
});

// A lane id is referenced from shell env (QA_LANE_ONLY), CI variables and JSON keys,
// so it is restricted to a conservative token: alphanumerics, dash and underscore.
const LANE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Locates qa-framework.config.json by walking up from `startDir`.
 *
 * The scaffold lives at qa/07-automation/e2e/ while the config lives at either the
 * project root or qa/, so a fixed relative path would be wrong for one of them.
 * Walking up finds it either way and returns undefined rather than throwing, so a
 * project with no config at all falls through to DEFAULT_LANE_TABLE.
 */
function findConfigPath(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  const seen = new Set();
  while (!seen.has(dir)) {
    seen.add(dir);
    for (const candidate of [
      path.join(dir, 'qa-framework.config.json'),
      path.join(dir, 'qa', 'qa-framework.config.json'),
    ]) {
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Validates and normalizes a `parallelLanes` config block into a lane table.
 *
 * Throws on any malformed lane rather than dropping it. A silently ignored lane is
 * the worst outcome available here: the project believes it has N lanes of
 * isolation, the lock hands out fewer, and two workers end up on one account - which
 * is the exact failure the whole mechanism exists to prevent.
 */
function laneTableFromConfig(config) {
  const block = config && config.parallelLanes;

  if (block === undefined || block === null) return DEFAULT_LANE_TABLE;
  if (typeof block !== 'object' || Array.isArray(block)) {
    throw new Error('[lane-config] parallelLanes must be an object.');
  }

  // `enabled: false` is an explicit opt-out that must land on the same behavior as
  // no config at all, so a project can disable lanes without deleting its lane
  // definitions.
  if (block.enabled === false) return DEFAULT_LANE_TABLE;

  const lanes = block.lanes;
  if (!Array.isArray(lanes) || lanes.length === 0) {
    throw new Error('[lane-config] parallelLanes.lanes must be a non-empty array.');
  }

  const table = {};
  for (const [index, lane] of lanes.entries()) {
    const where = `parallelLanes.lanes[${index}]`;
    if (!lane || typeof lane !== 'object' || Array.isArray(lane)) {
      throw new Error(`[lane-config] ${where} must be an object.`);
    }

    const id = lane.id;
    if (typeof id !== 'string' || !LANE_ID_PATTERN.test(id)) {
      throw new Error(
        `[lane-config] ${where}.id must be a non-empty string of letters, digits, "-" or "_". Got: ${JSON.stringify(id)}`
      );
    }
    if (table[id]) {
      throw new Error(`[lane-config] duplicate lane id "${id}" at ${where}.`);
    }

    for (const field of ['account', 'storageState']) {
      if (typeof lane[field] !== 'string' || lane[field].length === 0) {
        throw new Error(`[lane-config] ${where}.${field} is required and must be a non-empty string.`);
      }
    }

    // mcpNamespace and runnerProject are optional: a lane may be CLI-only (no MCP
    // server provisioned for it) or may not be bound to a runner project at all.
    // Both are normalized to null so consumers never have to distinguish "absent"
    // from "explicitly none".
    for (const field of ['mcpNamespace', 'runnerProject']) {
      const value = lane[field];
      if (value !== undefined && value !== null && (typeof value !== 'string' || value.length === 0)) {
        throw new Error(`[lane-config] ${where}.${field} must be a non-empty string when present.`);
      }
    }

    let capabilities = lane.capabilities;
    if (capabilities === undefined || capabilities === null) {
      capabilities = [];
    } else if (!Array.isArray(capabilities) || capabilities.some((c) => typeof c !== 'string' || !c)) {
      throw new Error(`[lane-config] ${where}.capabilities must be an array of non-empty strings.`);
    }

    table[id] = Object.freeze({
      account: lane.account,
      storageState: lane.storageState,
      mcpNamespace: lane.mcpNamespace === undefined ? null : lane.mcpNamespace,
      runnerProject: lane.runnerProject === undefined ? null : lane.runnerProject,
      capabilities: Object.freeze([...capabilities]),
    });
  }

  // Two lanes sharing a storageState means two "isolated" lanes writing the same
  // session file - they are not isolated at all, and the corruption is silent.
  const byStorageState = new Map();
  for (const [id, lane] of Object.entries(table)) {
    const clash = byStorageState.get(lane.storageState);
    if (clash) {
      throw new Error(
        `[lane-config] lanes "${clash}" and "${id}" share storageState "${lane.storageState}". ` +
        'Each lane must have its own storageState file, otherwise the lanes are not isolated.'
      );
    }
    byStorageState.set(lane.storageState, id);
  }

  return Object.freeze(table);
}

/** Reads the config file at `configPath` and returns its lane table. */
function loadLaneTable(configPath) {
  const resolved = configPath || findConfigPath(process.cwd());
  if (!resolved || !fs.existsSync(resolved)) return DEFAULT_LANE_TABLE;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (err) {
    throw new Error(`[lane-config] Could not parse ${resolved}: ${err.message}`);
  }
  return laneTableFromConfig(config);
}

/**
 * Maps a QA_LANE_ONLY value to a lane id.
 *
 * 'default' is accepted as an alias for the first declared lane, because the
 * pre-N-lane scaffold and its CI pipelines already used QA_LANE_ONLY=default and
 * those must keep working. Every other value must name a declared lane exactly.
 *
 * Throws on anything unrecognized. Callers must never silently fall back to a
 * guessed lane: guessing is how a run lands on an account it does not hold.
 */
function laneIdForQaLaneOnly(qaLaneOnly, laneTable) {
  const table = laneTable || loadLaneTable();
  const ids = Object.keys(table);

  if (qaLaneOnly === 'default') {
    if (table.default) return 'default';
    return ids[0];
  }
  if (typeof qaLaneOnly === 'string' && table[qaLaneOnly]) return qaLaneOnly;

  throw new Error(
    `[lane-config] Invalid QA_LANE_ONLY: ${JSON.stringify(qaLaneOnly)}. ` +
    `Allowed values: default, ${ids.join(', ')}.`
  );
}

/**
 * Single source of truth for the lane -> storageState mapping.
 *
 * playwright.config.ts resolves every project's storageState through this function
 * instead of hardcoding one per project. A parallel hardcoded mapping caused real
 * evidence corruption once already - a run recorded under the wrong account, because
 * the project's storageState was pinned to one lane while QA_LANE_ONLY named
 * another. There must be exactly one place this mapping lives, and this is it.
 */
function storageStateForLaneOnly(qaLaneOnly, laneTable) {
  const table = laneTable || loadLaneTable();
  return table[laneIdForQaLaneOnly(qaLaneOnly, table)].storageState;
}

/** Lane ids that declare `capability`. */
function lanesWithCapability(capability, laneTable) {
  const table = laneTable || loadLaneTable();
  return Object.keys(table).filter((id) => table[id].capabilities.includes(capability));
}

/**
 * Throws unless lane `laneId` declares `capability`.
 *
 * This is the guard for the "6 accounts but only 3 MCP servers" failure: handing a
 * consumer a lane that lacks a capability it needs fails later, confusingly, and
 * inside the consumer. Failing here names the lane, the capability and what the lane
 * actually has.
 */
function assertLaneHasCapability(laneId, capability, laneTable) {
  const table = laneTable || loadLaneTable();
  const lane = table[laneId];
  if (!lane) throw new Error(`[lane-config] Unknown lane: ${laneId}`);
  if (!lane.capabilities.includes(capability)) {
    const have = lane.capabilities.length ? lane.capabilities.join(', ') : 'none';
    throw new Error(
      `[lane-config] Lane ${laneId} does not have capability "${capability}" (declared: ${have}). ` +
      `Lanes with that capability: ${lanesWithCapability(capability, table).join(', ') || 'none'}.`
    );
  }
}

module.exports = {
  DEFAULT_LANE_TABLE,
  findConfigPath,
  laneTableFromConfig,
  loadLaneTable,
  laneIdForQaLaneOnly,
  storageStateForLaneOnly,
  lanesWithCapability,
  assertLaneHasCapability,
};
