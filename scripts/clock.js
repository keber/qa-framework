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
 *   - fully offline: it never opens a network connection.
 *
 * Exit codes:
 *   0  stamp printed
 *   1  usage error: bad option or invalid time zone
 *
 * No dependencies: Node >= 20 built-ins only (Intl).
 */

'use strict';

const HELP = `
qa-framework clock - print the real current date/time from the OS clock

Usage:
  qa-framework clock [--tz <IANA zone>] [--date | --json]

Options:
  --tz <zone>   IANA time zone, e.g. America/Santiago or UTC.
                Default: QA_TIMEZONE env var, else the OS zone.
  --date        Print only the local date (YYYY-MM-DD).
  --json        Print the full record as JSON (iso, date, time, timeZone,
                timeZoneSource, utcOffset, utc, epochMs).
  --help, -h    Show this help.

Offline: reads the OS clock only, never the network.
Exit codes: 0 ok, 1 usage error.

Examples:
  qa-framework clock --tz America/Santiago
  qa-framework clock --date
  qa-framework clock --json
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

function parseArgs(argv) {
  const args = { tz: undefined, json: false, dateOnly: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--date') args.dateOnly = true;
    else if (arg.startsWith('--tz=')) args.tz = arg.slice('--tz='.length);
    else if (arg === '--tz') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new UsageError('--tz requires a value');
      args.tz = v;
      i++;
    } else {
      throw new UsageError(`Unknown option "${arg}"`);
    }
  }
  if (args.json && args.dateOnly) throw new UsageError('--date and --json cannot be combined');
  return args;
}

/**
 * Runs the command. Returns the exit code; never calls process.exit, so it is testable.
 * deps: { now, env, out, err, osZone } - all optional.
 */
function run(argv, deps = {}) {
  const {
    now = () => new Date(),
    env = process.env,
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
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    err(`[qa-framework/clock] ${error.message}\n`);
    return 1;
  }

  const stamp = formatStamp(now(), zone.timeZone);
  if (args.json) out(`${JSON.stringify({ ...stamp, timeZoneSource: zone.source }, null, 2)}\n`);
  else if (args.dateOnly) out(`${stamp.date}\n`);
  else out(`${stamp.iso} ${stamp.timeZone}\n`);
  return 0;
}

module.exports = {
  isIanaTimeZone,
  resolveTimeZone,
  formatStamp,
  parseArgs,
  run,
  UsageError,
};

if (require.main === module) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[qa-framework/clock] ${error && error.stack ? error.stack : error}\n`);
    process.exitCode = 1;
  }
}
