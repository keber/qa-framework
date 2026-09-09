#!/usr/bin/env node
'use strict';

/**
 * Guard functions for global-setup.ts.
 *
 * These live in a plain CommonJS module rather than as private functions inside
 * global-setup.ts so they are directly testable with `node --test`, without adding a
 * TypeScript test runner (ts-node/tsx) as a dependency. global-setup.ts requires this
 * module the same way it requires ./lane-lock.js.
 *
 * WHY GUARDS AT ALL: a lock nothing consults is decoration. global-setup is the one
 * place that actually performs a login, so it is the last point at which a run about
 * to drive an account it does not hold can still be stopped.
 *
 * global-setup NEVER calls acquire or reserve itself. It only READS lane state and
 * verifies the lane is already held. Owning the reserve/release lifecycle is the
 * caller's job - the CLI operator, the orchestrator, or the CI job. A global-setup
 * that reserved its own lane would make every accidental run look legitimate.
 *
 * Each guard takes an explicit `env` (defaulting to process.env) and an injectable
 * lane-lock module, so tests can pass a synthetic matrix without mutating globals.
 */

/**
 * Fail-closed guard. Runs BEFORE any login or browser work.
 *
 * Without QA_LANE_ONLY this is a "cold setup" that re-logs in EVERY lane's account,
 * which silently invalidates any other agent's or CI job's concurrently running
 * session on the shared QA server. That is occasionally what you actually want, so
 * QA_COLD_SETUP=1 is the single explicit escape hatch - explicit so it can never be
 * an accident. If neither is set, throw before touching anything.
 */
function assertColdSetupIsIntentional(env) {
  env = env || process.env;
  if (env.QA_LANE_ONLY) return;
  if (env.QA_COLD_SETUP === '1') return;
  throw new Error(
    '[global-setup] Refusing to run a cold setup (no QA_LANE_ONLY set). A cold setup re-logs in ' +
    "EVERY lane account and can silently invalidate another agent or CI job's concurrently " +
    'running session on the shared QA server. Set QA_LANE_ONLY=<lane id> to log in a single lane ' +
    'only, or set QA_COLD_SETUP=1 explicitly if you really intend to relogin ALL lanes.'
  );
}

/**
 * Lane-lock awareness guard. Only meaningful when QA_LANE_ONLY is set; the cold-setup
 * guard above already rejects the "neither set" case.
 *
 * Skipped entirely in CI (env.CI === 'true'): the locks directory is local, ephemeral
 * and per-machine, and does not persist between CI agents, so a CI job's lane will
 * never appear busy in a fresh agent's lanes.json and enforcing this there would fail
 * every time. The CI-side equivalent belongs at the pipeline level - fail the job in
 * seconds if QA_LANE_ONLY is empty, before npm ci and browser installation.
 */
function assertLaneIsLocked(laneOnly, env, laneLockModule) {
  env = env || process.env;
  if (env.CI === 'true') return;

  const laneLock = laneLockModule || require('./lane-lock.js');

  const laneId = laneLock.laneIdForQaLaneOnly(laneOnly);
  const state = laneLock.loadState();
  const laneState = state.lanes[laneId];

  if (!laneState || laneState.status !== 'busy') {
    throw new Error(
      `[global-setup] QA_LANE_ONLY=${laneOnly} (lane ${laneId}) is not reserved in the lane lock state. ` +
      'Run `node scripts/lane-lock.js reserve <laneId> "<label>"` before running Playwright locally, ' +
      'so global-setup knows this lane is intentionally in use.'
    );
  }
}

/**
 * Parses --project=<name> and --project <name> out of an argv-shaped array. Returns
 * every match in order, because Playwright accepts --project more than once.
 */
function selectedProjectNamesFromArgv(argv) {
  const names = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--project=')) {
      names.push(arg.slice('--project='.length));
      continue;
    }
    if (arg === '--project' && i + 1 < argv.length) {
      names.push(argv[i + 1]);
      i++;
    }
  }
  return names;
}

/**
 * Project/lane correspondence guard.
 *
 * The guards above verify the LANE named by QA_LANE_ONLY is held. They never check
 * that the --project actually being run points its storageState at that same lane.
 * This closes that gap by comparing the storageState of the requested project(s)
 * against the storageState the lane table says QA_LANE_ONLY should be using.
 *
 * With playwright.config.ts resolving storageState through the lane table, this
 * should never fire in the happy path. It is kept as cheap defense in depth for two
 * cases that stay real: a regression in the resolver itself, and a future project
 * added with a hand-hardcoded storageState (an easy mistake to make by copy-pasting
 * an older project block). That second case is exactly what caused evidence
 * corruption before the resolver existed, and this guard is the only thing that
 * catches it at runtime.
 *
 * `projects` is the COMPLETE unfiltered list Playwright passes to globalSetup, not
 * just the ones selected by --project, so process.argv is the only reliable signal
 * for what was actually requested.
 */
function assertProjectsMatchLane(qaLaneOnly, projects, argv, laneLockModule) {
  if (!qaLaneOnly) return; // cold-setup path, already gated above

  argv = argv || process.argv;
  const laneLock = laneLockModule || require('./lane-lock.js');

  const selectedNames = selectedProjectNamesFromArgv(argv);
  if (selectedNames.length === 0) {
    throw new Error(
      `[global-setup] QA_LANE_ONLY=${qaLaneOnly} is set but no --project was passed on the CLI. ` +
      'Running without --project executes EVERY project declared in playwright.config.ts, most of ' +
      "which point at other lanes' storageState - this would silently drive another lane's session " +
      'instead of the one you reserved. Pass --project=<name> explicitly.'
    );
  }

  const selectedProjects = selectedNames.map((name) => {
    const found = (projects || []).find((p) => p.name === name);
    if (!found) {
      throw new Error(
        `[global-setup] --project=${name} does not match any project declared in playwright.config.ts. ` +
        'Check for a typo in the --project value.'
      );
    }
    return found;
  });

  const laneId = laneLock.laneIdForQaLaneOnly(qaLaneOnly);
  const expectedStorageState = laneLock.LANE_INFO[laneId].storageState;

  // Projects without a string use.storageState (the 'setup' project, for instance)
  // do not authenticate against any lane, so there is nothing to compare. Filtering
  // by "has a string storageState" rather than by a name allowlist means any future
  // no-auth project is excluded automatically.
  const mismatches = selectedProjects.filter((p) => {
    const storageState = p.use && p.use.storageState;
    return typeof storageState === 'string' && storageState !== expectedStorageState;
  });

  if (mismatches.length > 0) {
    const reverseLookup = (storageState) => {
      for (const [id, info] of Object.entries(laneLock.LANE_INFO)) {
        if (info.storageState === storageState) return id;
      }
      return 'unknown';
    };

    const details = mismatches
      .map((p) => {
        const actual = p.use.storageState;
        return `  - project "${p.name}" uses storageState "${actual}" (that storageState belongs to ` +
          `lane ${reverseLookup(actual)}, not lane ${laneId})`;
      })
      .join('\n');

    throw new Error(
      `[global-setup] QA_LANE_ONLY=${qaLaneOnly} (lane ${laneId}, expected storageState ` +
      `"${expectedStorageState}") does not match the storageState of the --project(s) requested:\n${details}\n` +
      'Either fix QA_LANE_ONLY to match the --project you are running, or pass a --project whose ' +
      'storageState matches the reserved lane.'
    );
  }
}

module.exports = {
  assertColdSetupIsIntentional,
  assertLaneIsLocked,
  selectedProjectNamesFromArgv,
  assertProjectsMatchLane,
};
