'use strict';

// C2 - real-clock helper. Agents have no perception of the current date and will invent
// one. `qa-framework clock` reads the OS clock and names the IANA time zone it used.
// It never touches the network unless --check-http <url> is given.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const CLI_PATH = path.join(REPO_ROOT, 'scripts', 'cli.js');

const {
  formatStamp,
  resolveTimeZone,
  isIanaTimeZone,
  checkHttpDate,
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

function noNetwork() {
  throw new Error('network must not be used');
}

function fakeFetch({ date, status = 200, reject } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    if (reject) throw reject;
    return {
      status,
      headers: { get: (name) => (name.toLowerCase() === 'date' ? date ?? null : null) },
    };
  };
  impl.calls = calls;
  return impl;
}

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
  assert.deepEqual(parseArgs([]), { tz: undefined, json: false, dateOnly: false, checkHttp: undefined, maxSkew: 120, timeoutMs: 5000, help: false });
  const a = parseArgs(['--tz', 'UTC', '--json', '--check-http', 'https://example.test/', '--max-skew', '30', '--timeout', '2000']);
  assert.equal(a.tz, 'UTC');
  assert.equal(a.json, true);
  assert.equal(a.checkHttp, 'https://example.test/');
  assert.equal(a.maxSkew, 30);
  assert.equal(a.timeoutMs, 2000);
  assert.equal(parseArgs(['--date']).dateOnly, true);
  assert.equal(parseArgs(['--tz=UTC']).tz, 'UTC');
});

test('parseArgs: unknown flags and missing values are usage errors', () => {
  assert.throws(() => parseArgs(['--bogus']), /Unknown option/);
  assert.throws(() => parseArgs(['--tz']), /--tz/);
  assert.throws(() => parseArgs(['--max-skew', 'abc']), /--max-skew/);
  assert.throws(() => parseArgs(['--timeout', '0']), /--timeout/);
});

// --- run: offline by default -------------------------------------------------------------

test('run: default prints the stamp and the zone, and never uses the network', async () => {
  const c = capture();
  const code = await run(['--tz', 'America/Santiago'], { now: () => FIXED, env: {}, fetchImpl: noNetwork, ...c.io });
  assert.equal(code, 0);
  assert.equal(c.stdout(), '2026-11-12T10:15:30-03:00 America/Santiago\n');
});

test('run: --date prints only the local date', async () => {
  const c = capture();
  const code = await run(['--date', '--tz', 'Asia/Tokyo'], { now: () => new Date('2026-11-12T20:00:00Z'), env: {}, fetchImpl: noNetwork, ...c.io });
  assert.equal(code, 0);
  assert.equal(c.stdout(), '2026-11-13\n');
});

test('run: --json prints the full record, zone source included', async () => {
  const c = capture();
  const code = await run(['--json'], { now: () => FIXED, env: { QA_TIMEZONE: 'UTC' }, fetchImpl: noNetwork, ...c.io });
  assert.equal(code, 0);
  const rec = JSON.parse(c.stdout());
  assert.equal(rec.iso, '2026-11-12T13:15:30+00:00');
  assert.equal(rec.timeZone, 'UTC');
  assert.equal(rec.timeZoneSource, 'QA_TIMEZONE');
  assert.equal(rec.httpCheck, undefined);
});

test('run: an invalid zone exits 1 with a message and prints no stamp', async () => {
  const c = capture();
  const code = await run(['--tz', 'Mars/Olympus'], { now: () => FIXED, env: {}, fetchImpl: noNetwork, ...c.io });
  assert.equal(code, 1);
  assert.equal(c.stdout(), '');
  assert.match(c.stderr(), /Mars\/Olympus/);
});

// --- opt-in HTTP Date check --------------------------------------------------------------

test('checkHttpDate: rejects non-http URLs and URLs carrying credentials', async () => {
  await assert.rejects(checkHttpDate('file:///etc/passwd', { fetchImpl: noNetwork }), /http/);
  await assert.rejects(checkHttpDate('ftp://example.test/', { fetchImpl: noNetwork }), /http/);
  await assert.rejects(checkHttpDate('https://user:pw@example.test/', { fetchImpl: noNetwork }), /credentials/);
  await assert.rejects(checkHttpDate('not a url', { fetchImpl: noNetwork }), /URL/);
});

test('checkHttpDate: HEAD without following redirects, skew measured against the OS clock', async () => {
  const fetchImpl = fakeFetch({ date: 'Thu, 12 Nov 2026 13:15:40 GMT' });
  const r = await checkHttpDate('https://example.test/', { fetchImpl, now: () => FIXED, timeoutMs: 1000 });
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].init.method, 'HEAD');
  assert.equal(fetchImpl.calls[0].init.redirect, 'manual');
  assert.ok(fetchImpl.calls[0].init.signal, 'request must carry a timeout signal');
  assert.equal(r.status, 'ok');
  assert.equal(r.serverDate, '2026-11-12T13:15:40Z');
  assert.equal(r.skewSeconds, 10);
});

test('run --check-http: within tolerance exits 0 and keeps the stamp first on stdout', async () => {
  const c = capture();
  const fetchImpl = fakeFetch({ date: 'Thu, 12 Nov 2026 13:15:00 GMT' });
  const code = await run(['--tz', 'UTC', '--check-http', 'https://example.test/'], { now: () => FIXED, env: {}, fetchImpl, ...c.io });
  assert.equal(code, 0);
  assert.equal(c.stdout(), '2026-11-12T13:15:30+00:00 UTC\n');
  assert.match(c.stderr(), /http-date: ok/);
  assert.match(c.stderr(), /skew -30 s/);
});

test('run --check-http: skew beyond --max-skew exits 2', async () => {
  const c = capture();
  const fetchImpl = fakeFetch({ date: 'Thu, 12 Nov 2026 14:15:30 GMT' });
  const code = await run(['--tz', 'UTC', '--json', '--max-skew', '60', '--check-http', 'https://example.test/'], { now: () => FIXED, env: {}, fetchImpl, ...c.io });
  assert.equal(code, 2);
  const rec = JSON.parse(c.stdout());
  assert.equal(rec.httpCheck.status, 'skew');
  assert.equal(rec.httpCheck.skewSeconds, 3600);
  assert.match(c.stderr(), /3600 s/);
});

test('run --check-http: offline exits 3 but still prints the OS stamp', async () => {
  const c = capture();
  const fetchImpl = fakeFetch({ reject: new TypeError('fetch failed') });
  const code = await run(['--tz', 'UTC', '--check-http', 'https://example.test/'], { now: () => FIXED, env: {}, fetchImpl, ...c.io });
  assert.equal(code, 3);
  assert.equal(c.stdout(), '2026-11-12T13:15:30+00:00 UTC\n');
  assert.match(c.stderr(), /http-date: unavailable/);
});

test('run --check-http: a response without a Date header exits 3', async () => {
  const c = capture();
  const fetchImpl = fakeFetch({ date: null });
  const code = await run(['--tz', 'UTC', '--check-http', 'https://example.test/'], { now: () => FIXED, env: {}, fetchImpl, ...c.io });
  assert.equal(code, 3);
  assert.match(c.stderr(), /no Date header/);
});

test('run --check-http: a bad URL is a usage error (exit 1), not a network attempt', async () => {
  const c = capture();
  const code = await run(['--tz', 'UTC', '--check-http', 'file:///x'], { now: () => FIXED, env: {}, fetchImpl: noNetwork, ...c.io });
  assert.equal(code, 1);
  assert.equal(c.stdout(), '');
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

test('cli clock --help and the main help both document the command', () => {
  const own = runCli(['clock', '--help']);
  assert.equal(own.status, 0);
  assert.match(own.stdout, /--check-http/);
  assert.match(own.stdout, /--tz/);
  const main = runCli(['--help']);
  assert.match(main.stdout, /clock/);
});

test('the skills that stamp dates point agents at the clock command', () => {
  const fs = require('node:fs');
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

test('cli clock --check-http: reads the Date header of a local server', async () => {
  const server = http.createServer((req, res) => {
    assert.equal(req.method, 'HEAD');
    res.setHeader('Date', new Date().toUTCString());
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const child = spawn(process.execPath, [CLI_PATH, 'clock', '--tz', 'UTC', '--json', '--check-http', `http://127.0.0.1:${port}/`]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const code = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(code, 0, stderr);
    const rec = JSON.parse(stdout);
    assert.equal(rec.httpCheck.status, 'ok');
    assert.ok(Math.abs(rec.httpCheck.skewSeconds) <= 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
