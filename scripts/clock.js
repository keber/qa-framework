#!/usr/bin/env node
/**
 * scripts/clock.js - real-clock helper (`qa-framework clock`)
 *
 * Why this exists: an LLM agent has no perception of the current date or of elapsed
 * time, and will invent either one when a report needs a stamp. Every date or time an
 * agent writes (report headers, "Date reported", cache manifests, session logs) must
 * come from the OS clock through this command, never from memory or inference.
 *
 * What it does:
 *   - reads the OS clock and prints it in an explicit IANA time zone, always naming the
 *     zone it used, so a stamp is never ambiguous;
 *   - zone resolution: --tz <IANA>, else the QA_TIMEZONE env var, else the OS zone.
 *     An invalid explicit zone is an error, never a silent fallback;
 *   - works offline: no network access at all unless --check-http <url> is given.
 *
 * Opt-in HTTP check (--check-http <url>): one HEAD request, redirects not followed, with
 * a timeout, to compare the OS clock with the server's Date header. It only reports the
 * skew; the printed stamp always comes from the OS clock. Use a server you trust
 * (for example the application under test). URLs with embedded credentials are refused.
 *
 * Exit codes:
 *   0  stamp printed (and, with --check-http, skew within tolerance)
 *   1  usage error: bad option, invalid time zone, invalid URL
 *   2  --check-http: the OS clock differs from the server by more than --max-skew
 *   3  --check-http: the server could not be reached or sent no Date header
 *      (the OS stamp is still printed)
 *
 * No dependencies: Node >= 20 built-ins only (Intl, fetch, AbortSignal.timeout).
 */

'use strict';

const DEFAULT_MAX_SKEW_SECONDS = 120;
const DEFAULT_TIMEOUT_MS = 5000;

const HELP = `
qa-framework clock - print the real current date/time from the OS clock

Usage:
  qa-framework clock [--tz <IANA zone>] [--date | --json]
                     [--check-http <url> [--max-skew <seconds>] [--timeout <ms>]]

Options:
  --tz <zone>           IANA time zone, e.g. America/Santiago or UTC.
                        Default: QA_TIMEZONE env var, else the OS zone.
  --date                Print only the local date (YYYY-MM-DD).
  --json                Print the full record as JSON (iso, date, time, timeZone,
                        timeZoneSource, utcOffset, utc, epochMs, httpCheck).
  --check-http <url>    Opt-in: compare the OS clock with the Date header of one
                        HEAD request to <url>. Off by default; no network otherwise.
  --max-skew <seconds>  Tolerance for --check-http (default ${DEFAULT_MAX_SKEW_SECONDS}).
  --timeout <ms>        Request timeout for --check-http (default ${DEFAULT_TIMEOUT_MS}).
  --help, -h            Show this help.

Exit codes: 0 ok, 1 usage error, 2 clock skew above tolerance, 3 server unreachable
or no Date header (the OS stamp is still printed).

Examples:
  qa-framework clock --tz America/Santiago
  qa-framework clock --date
  qa-framework clock --json --check-http https://qa.example.test/
`;

class UsageError extends Error {}

/** True for an IANA zone name (or UTC) that this runtime knows. Offsets are rejected. */
function isIanaTimeZone(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  if (/^[+\-\d]/.test(value.trim())) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function osTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Picks the zone: --tz, then QA_TIMEZONE, then the OS. Returns { timeZone, source }.
 * An invalid value in an explicit source throws instead of falling back.
 */
function resolveTimeZone(cliTz, env = process.env, osZone = osTimeZone) {
  if (cliTz !== undefined) {
    if (!isIanaTimeZone(cliTz)) {
      throw new UsageError(`--tz "${cliTz}" is not a known IANA time zone (e.g. America/Santiago, UTC)`);
    }
    return { timeZone: cliTz, source: '--tz' };
  }
  const fromEnv = env && env.QA_TIMEZONE;
  if (fromEnv !== undefined && fromEnv !== '') {
    if (!isIanaTimeZone(fromEnv)) {
      throw new UsageError(`QA_TIMEZONE "${fromEnv}" is not a known IANA time zone`);
    }
    return { timeZone: fromEnv, source: 'QA_TIMEZONE' };
  }
  const fromOs = osZone();
  if (!isIanaTimeZone(fromOs)) {
    throw new UsageError('the OS reports no IANA time zone; pass one with --tz');
  }
  return { timeZone: fromOs, source: 'os' };
}

const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');

/** Formats `date` as wall-clock time in `timeZone`, with the zone's UTC offset. */
function formatStamp(date, timeZone) {
  if (!isIanaTimeZone(timeZone)) {
    throw new UsageError(`"${timeZone}" is not a known IANA time zone`);
  }
  const parts = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  const y = Number(parts.year);
  const mo = Number(parts.month);
  const d = Number(parts.day);
  const h = Number(parts.hour) % 24;
  const mi = Number(parts.minute);
  const s = Number(parts.second);

  const epochMs = date.getTime();
  const wholeSecondMs = Math.floor(epochMs / 1000) * 1000;
  const offsetMinutes = Math.round((Date.UTC(y, mo - 1, d, h, mi, s) - wholeSecondMs) / 60000);
  const sign = offsetMinutes < 0 ? '-' : '+';
  const utcOffset = `${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;

  const localDate = `${pad(y, 4)}-${pad(mo)}-${pad(d)}`;
  const localTime = `${pad(h)}:${pad(mi)}:${pad(s)}`;
  return {
    iso: `${localDate}T${localTime}${utcOffset}`,
    date: localDate,
    time: localTime,
    timeZone,
    utcOffset,
    utc: new Date(wholeSecondMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    epochMs,
  };
}

function validateCheckUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UsageError(`--check-http "${raw}" is not a valid URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UsageError(`--check-http accepts only http: or https: URLs, got "${url.protocol}"`);
  }
  if (url.username || url.password) {
    throw new UsageError('--check-http refuses URLs with embedded credentials');
  }
  return url;
}

/**
 * Opt-in: one HEAD request to `rawUrl`, comparing its Date header with the OS clock.
 * Rejects (UsageError) only for an invalid URL. Network failures resolve with
 * status "unavailable". The skew is server minus OS clock, in whole seconds.
 */
async function checkHttpDate(rawUrl, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    now = () => new Date(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxSkewSeconds = DEFAULT_MAX_SKEW_SECONDS,
  } = options;
  const url = validateCheckUrl(rawUrl);
  const base = { origin: url.origin, maxSkewSeconds };

  if (typeof fetchImpl !== 'function') {
    return { ...base, status: 'unavailable', error: 'fetch is not available in this runtime' };
  }

  let response;
  const sentAt = now().getTime();
  try {
    response = await fetchImpl(url.href, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const reason = error && error.name === 'TimeoutError'
      ? `no response within ${timeoutMs} ms`
      : String((error && (error.cause?.code || error.cause?.message || error.message)) || error);
    return { ...base, status: 'unavailable', error: reason };
  }
  const receivedAt = now().getTime();

  const header = response.headers.get('date');
  const serverMs = header ? Date.parse(header) : NaN;
  if (!header || Number.isNaN(serverMs)) {
    return {
      ...base,
      status: 'unavailable',
      error: header ? `unparseable Date header "${header}"` : 'no Date header in the response',
    };
  }

  const localMs = (sentAt + receivedAt) / 2;
  const skewSeconds = Math.round((serverMs - localMs) / 1000) || 0;
  return {
    ...base,
    status: Math.abs(skewSeconds) > maxSkewSeconds ? 'skew' : 'ok',
    serverDate: new Date(serverMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    skewSeconds,
  };
}

function parseArgs(argv) {
  const args = {
    tz: undefined,
    json: false,
    dateOnly: false,
    checkHttp: undefined,
    maxSkew: DEFAULT_MAX_SKEW_SECONDS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
  };
  const valueOf = (name, i, inline) => {
    if (inline !== undefined) return [inline, i];
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${name} requires a value`);
    return [v, i + 1];
  };
  const positiveNumber = (name, raw, { integer = false } = {}) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isInteger(n))) {
      throw new UsageError(`${name} must be a positive number, got "${raw}"`);
    }
    return n;
  };

  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].startsWith('--') && argv[i].includes('=')
      ? [argv[i].slice(0, argv[i].indexOf('=')), argv[i].slice(argv[i].indexOf('=') + 1)]
      : [argv[i], undefined];
    let v;
    switch (flag) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--json':
        args.json = true;
        break;
      case '--date':
        args.dateOnly = true;
        break;
      case '--tz':
        [args.tz, i] = valueOf(flag, i, inline);
        break;
      case '--check-http':
        [args.checkHttp, i] = valueOf(flag, i, inline);
        break;
      case '--max-skew':
        [v, i] = valueOf(flag, i, inline);
        args.maxSkew = positiveNumber(flag, v);
        break;
      case '--timeout':
        [v, i] = valueOf(flag, i, inline);
        args.timeoutMs = positiveNumber(flag, v, { integer: true });
        break;
      default:
        throw new UsageError(`Unknown option "${argv[i]}"`);
    }
  }
  if (args.json && args.dateOnly) throw new UsageError('--date and --json cannot be combined');
  return args;
}

function describeCheck(check) {
  if (check.status === 'unavailable') {
    return `http-date: unavailable (${check.error}) from ${check.origin}; the stamp comes from the OS clock only`;
  }
  const detail = `skew ${check.skewSeconds} s (server ${check.serverDate}, tolerance ${check.maxSkewSeconds} s) from ${check.origin}`;
  return check.status === 'ok'
    ? `http-date: ok, ${detail}`
    : `http-date: skew, the OS clock differs from the server by ${Math.abs(check.skewSeconds)} s; ${detail}`;
}

/**
 * Runs the command. Returns the exit code; never calls process.exit, so it is testable.
 * deps: { now, env, fetchImpl, out, err } - all optional.
 */
async function run(argv, deps = {}) {
  const {
    now = () => new Date(),
    env = process.env,
    fetchImpl = globalThis.fetch,
    out = (s) => process.stdout.write(s),
    err = (s) => process.stderr.write(s),
    osZone = osTimeZone,
  } = deps;

  let args;
  let zone;
  try {
    args = parseArgs(argv);
    if (args.help) {
      out(HELP);
      return 0;
    }
    zone = resolveTimeZone(args.tz, env, osZone);
    if (args.checkHttp !== undefined) validateCheckUrl(args.checkHttp);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    err(`[qa-framework/clock] ${error.message}\n`);
    return 1;
  }

  const stamp = formatStamp(now(), zone.timeZone);
  const record = { ...stamp, timeZoneSource: zone.source };

  let check;
  if (args.checkHttp !== undefined) {
    check = await checkHttpDate(args.checkHttp, {
      fetchImpl,
      now,
      timeoutMs: args.timeoutMs,
      maxSkewSeconds: args.maxSkew,
    });
    record.httpCheck = check;
  }

  if (args.json) out(`${JSON.stringify(record, null, 2)}\n`);
  else if (args.dateOnly) out(`${stamp.date}\n`);
  else out(`${stamp.iso} ${stamp.timeZone}\n`);

  if (!check) return 0;
  err(`${describeCheck(check)}\n`);
  if (check.status === 'skew') return 2;
  if (check.status === 'unavailable') return 3;
  return 0;
}

module.exports = {
  isIanaTimeZone,
  resolveTimeZone,
  formatStamp,
  checkHttpDate,
  parseArgs,
  run,
  UsageError,
};

if (require.main === module) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(`[qa-framework/clock] ${error && error.stack ? error.stack : error}\n`);
      process.exitCode = 1;
    }
  );
}
