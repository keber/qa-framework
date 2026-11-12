'use strict';

// C2 - real-clock helper. Agents have no perception of the current date and will invent
// one. `qa-framework clock` reads the OS clock and names the IANA time zone it used.
// It is fully offline: it never touches the network.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const CLI_PATH = path.join(REPO_ROOT, 'scripts', 'cli.js');
const CLOCK_PATH = path.join(REPO_ROOT, 'scripts', 'clock.js');

const {
  formatStamp,
  resolveTimeZone,
  isIanaTimeZone,
  parseArgs,
  run,
} = require('../scripts/clock');

const FIXED = new Date('2026-11-12T13:15:30.250Z');

function capture() {
  const out = [];
  const err = [];
  return {
    io: { out: (s) => out.push(s), err: (s) => err.push(s) },
    stdout: () => out.join(''),
    stderr: () => err.join(''),
  };
}

// --- no network, by construction -------------------------------------------------------

test('clock source: no network module, no fetch', () => {
  const source = fs.readFileSync(CLOCK_PATH, 'utf8');
  const required = [...source.matchAll(/require\(\s*['"`]([^'"`]+)['"`]\s*\)/g)].map((m) => m[1]);
  const imported = [...source.matchAll(/\bimport\s*(?:[^'"`]*\bfrom\s*)?\(?\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]);
  const network = /^(node:)?(http|https|http2|net|tls|dgram|dns|undici)(\/.*)?$/;
  for (const mod of [...required, ...imported]) {
    assert.doesNotMatch(mod, network, `clock.js loads network module "${mod}"`);
  }
  assert.doesNotMatch(source, /\bfetch\b/, 'clock.js must not use fetch');
  assert.doesNotMatch(source, /\bXMLHttpRequest\b|\bWebSocket\b/, 'clock.js must not open connections');
});

test('clock help documents no network option', () => {
  const c = capture();
  assert.equal(run(['--help'], c.io), 0);
  assert.doesNotMatch(c.stdout(), /check-http|max-skew|--timeout/);
  assert.match(c.stdout(), /never the network/);
});

// --- formatStamp -----------------------------------------------------------------------

test('formatStamp: local wall time with the zone offset, America/Santiago in November', () => {
  const s = formatStamp(FIXED, 'America/Santiago');
  assert.equal(s.iso, '2026-11-12T10:15:30-03:00');
  assert.equal(s.date, '2026-11-12');
  assert.equal(s.time, '10:15:30');
  assert.equal(s.utcOffset, '-03:00');
  assert.equal(s.timeZone, 'America/Santiago');
  assert.equal(s.utc, '2026-11-12T13:15:30Z');
  assert.equal(s.epochMs, FIXED.getTime());
});

test('formatStamp: UTC and a half-hour offset', () => {
  assert.equal(formatStamp(FIXED, 'UTC').iso, '2026-11-12T13:15:30+00:00');
  assert.equal(formatStamp(FIXED, 'Asia/Kolkata').iso, '2026-11-12T18:45:30+05:30');
});

test('formatStamp: the local date can differ from the UTC date', () => {
  const late = new Date('2026-11-12T20:00:00Z');
  const tokyo = formatStamp(late, 'Asia/Tokyo');
  assert.equal(tokyo.date, '2026-11-13');
  assert.equal(tokyo.iso, '2026-11-13T05:00:00+09:00');
  const early = new Date('2026-11-13T01:30:00Z');
  assert.equal(formatStamp(early, 'America/Santiago').date, '2026-11-12');
});

test('formatStamp: midnight is 00, never 24', () => {
  const midnight = new Date('2026-11-12T03:00:00Z');
  assert.equal(formatStamp(midnight, 'America/Santiago').time, '00:00:00');
});

test('formatStamp: an unknown zone throws', () => {
  assert.throws(() => formatStamp(FIXED, 'Mars/Olympus'), /time zone/i);
});

// --- time zone resolution ----------------------------------------------------------------

test('isIanaTimeZone: accepts IANA names and UTC, rejects offsets and junk', () => {
  assert.equal(isIanaTimeZone('America/Santiago'), true);
  assert.equal(isIanaTimeZone('UTC'), true);
  assert.equal(isIanaTimeZone('Etc/GMT+3'), true);
  assert.equal(isIanaTimeZone('+03:00'), false);
  assert.equal(isIanaTimeZone('-0300'), false);
  assert.equal(isIanaTimeZone('Mars/Olympus'), false);
  assert.equal(isIanaTimeZone(''), false);
  assert.equal(isIanaTimeZone(undefined), false);
});

test('resolveTimeZone: --tz wins over QA_TIMEZONE, which wins over the OS zone', () => {
  const env = { QA_TIMEZONE: 'Asia/Tokyo' };
  assert.deepEqual(resolveTimeZone('UTC', env, () => 'Europe/Madrid'), {
    timeZone: 'UTC',
    source: '--tz',
  });
  assert.deepEqual(resolveTimeZone(undefined, env, () => 'Europe/Madrid'), {
    timeZone: 'Asia/Tokyo',
    source: 'QA_TIMEZONE',
  });
  assert.deepEqual(resolveTimeZone(undefined, {}, () => 'Europe/Madrid'), {
    timeZone: 'Europe/Madrid',
    source: 'os',
  });
});

test('resolveTimeZone: an invalid explicit zone is an error, not a silent fallback', () => {
  assert.throws(() => resolveTimeZone('+03:00', {}, () => 'UTC'), /--tz/);
  assert.throws(() => resolveTimeZone(undefined, { QA_TIMEZONE: 'Nowhere/City' }, () => 'UTC'), /QA_TIMEZONE/);
});

test('resolveTimeZone: an OS that reports no IANA zone is an error asking for --tz', () => {
  assert.throws(() => resolveTimeZone(undefined, {}, () => undefined), /--tz/);
});

// --- argument parsing --------------------------------------------------------------------

test('parseArgs: flags and values', () => {
  assert.deepEqual(parseArgs([]), { tz: undefined, json: false, dateOnly: false, help: false });
  const a = parseArgs(['--tz', 'UTC', '--json']);
  assert.equal(a.tz, 'UTC');
  assert.equal(a.json, true);
  assert.equal(parseArgs(['--date']).dateOnly, true);
  assert.equal(parseArgs(['--tz=UTC']).tz, 'UTC');
});

test('parseArgs: unknown flags, missing values and conflicting outputs are usage errors', () => {
  assert.throws(() => parseArgs(['--bogus']), /Unknown option/);
  assert.throws(() => parseArgs(['--check-http', 'https://example.test/']), /Unknown option/);
  assert.throws(() => parseArgs(['--tz']), /--tz/);
  assert.throws(() => parseArgs(['--date', '--json']), /cannot be combined/);
});

// --- run ---------------------------------------------------------------------------------

test('run: default prints the stamp and the zone', () => {
  const c = capture();
  const code = run(['--tz', 'America/Santiago'], { now: () => FIXED, env: {}, ...c.io });
  assert.equal(code, 0);
  assert.equal(c.stdout(), '2026-11-12T10:15:30-03:00 America/Santiago\n');
});

test('run: --date prints only the local date', () => {
  const c = capture();
  const code = run(['--date', '--tz', 'Asia/Tokyo'], { now: () => new Date('2026-11-12T20:00:00Z'), env: {}, ...c.io });
  assert.equal(code, 0);
  assert.equal(c.stdout(), '2026-11-13\n');
});

test('run: --json prints the full record, zone source included', () => {
  const c = capture();
  const code = run(['--json'], { now: () => FIXED, env: { QA_TIMEZONE: 'UTC' }, ...c.io });
  assert.equal(code, 0);
  const rec = JSON.parse(c.stdout());
  assert.equal(rec.iso, '2026-11-12T13:15:30+00:00');
  assert.equal(rec.timeZone, 'UTC');
  assert.equal(rec.timeZoneSource, 'QA_TIMEZONE');
});

test('run: an invalid zone exits 1 with a message and prints no stamp', () => {
  const c = capture();
  const code = run(['--tz', 'Mars/Olympus'], { now: () => FIXED, env: {}, ...c.io });
  assert.equal(code, 1);
  assert.equal(c.stdout(), '');
  assert.match(c.stderr(), /Mars\/Olympus/);
});

// --- end to end through the package CLI --------------------------------------------------

function runCli(args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { encoding: 'utf8' });
}

test('cli clock: prints the real OS time in the requested zone', () => {
  const before = Date.now();
  const result = runCli(['clock', '--tz', 'UTC', '--json']);
  const after = Date.now();
  assert.equal(result.status, 0, result.stderr);
  const rec = JSON.parse(result.stdout);
  assert.equal(rec.timeZone, 'UTC');
  assert.equal(rec.timeZoneSource, '--tz');
  assert.ok(rec.epochMs >= before - 1000 && rec.epochMs <= after + 1000, 'stamp is not the OS clock');
  assert.match(rec.iso, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/);
});

test('cli clock: default output names the zone', () => {
  const result = runCli(['clock', '--tz', 'America/Santiago']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2} America\/Santiago\n$/);
});

test('cli clock: an invalid zone exits 1', () => {
  const result = runCli(['clock', '--tz', 'Mars/Olympus']);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
});

test('cli clock --help and the main help both document the command', () => {
  const own = runCli(['clock', '--help']);
  assert.equal(own.status, 0);
  assert.match(own.stdout, /--tz/);
  const main = runCli(['--help']);
  assert.match(main.stdout, /clock/);
});

test('the skills that stamp dates point agents at the clock command', () => {
  for (const rel of [
    'skills/qa-maintenance/SKILL.md',
    'skills/qa-test-stabilization/SKILL.md',
    'templates/AGENTS.md',
    'templates/agents/qa-reporte-ejecucion.md',
  ]) {
    const text = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    assert.match(text, /npx qa-framework clock/, rel);
  }
});
