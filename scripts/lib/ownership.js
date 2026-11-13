'use strict';

/**
 * scripts/lib/ownership.js - Ownership of the files upgrade force-writes
 *
 * upgrade rewrites five kinds of framework files on every run: the skills under
 * .github/skills/, the command wrappers under .claude/commands/, the Claude Code rules
 * (.claude/rules/qa-framework.md), the Copilot instructions
 * (.github/instructions/qa-framework.instructions.md) and qa/QA-STRUCTURE-GUIDE.md.
 * A project may have edited any of them. This module tells the two cases apart:
 *
 *   pristine - the file equals a version the framework shipped (after normalization),
 *              or carries an intact generated marker: safe to overwrite.
 *   edited   - anything else: upgrade backs it up, overwrites it, and lists in a
 *              triage report the lines the project added to the version it came from.
 *
 * What was shipped comes from ownership-manifest.json, generated from the release tags
 * by scripts/build-ownership-manifest.js (a repository script: upgrade never runs git).
 *
 * Manifest format (format 1):
 *   lineHashChars  width of one line hash: base64url of sha256(line), truncated
 *   lines          every stored line hash, concatenated (fixed width, no separator)
 *   files[key]     key = project-relative path, '/' separated
 *     current      fileHash() of this release's content (the "base")
 *     x            [first, count]: this file's extra lines in `lines`, in line units
 *     versions[]   one per distinct content, oldest first
 *       tags       releases that shipped exactly this content ("1.12.0", ...)
 *       hash       fileHash() of the normalized content (16 hex chars of sha256)
 *       seq        [start, length, start, length, ...] ranges into the virtual table
 *                  T = lineHashes(base) ++ extras. The base is never stored: it is
 *                  recomputed from this package's own files, which is why the
 *                  invariant test insists that `current` matches them.
 *
 * Normalization, applied before any hash: UTF-8 BOM dropped, CRLF as LF, the trailing
 * generated marker removed (commands), and for the rules and instructions the rendered
 * version in "`@keber/qa-framework` v<version>" put back to {{VERSION}}: init and
 * upgrade render that placeholder, from config.frameworkVersion before 1.14.0-rc.2
 * and from the package version since.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  normalizeNewlines,
  splitGenerated,
  stampGenerated,
} = require('./generated-marker');
const { buildCommandBody, discoverSkillNames, commandFileName } = require('./claude-commands');

const MANIFEST_PATH = path.join(__dirname, 'ownership-manifest.json');
const MANIFEST_FORMAT = 1;
const FILE_HASH_CHARS = 16;
const LINE_HASH_CHARS = 6;

const RULES_KEY = '.claude/rules/qa-framework.md';
const INSTRUCTIONS_KEY = '.github/instructions/qa-framework.instructions.md';
const GUIDE_KEY = 'qa/QA-STRUCTURE-GUIDE.md';
const COMMANDS_PREFIX = '.claude/commands/';
const SKILLS_PREFIX = '.github/skills/';

const STAMPED_KEYS = new Set([RULES_KEY, INSTRUCTIONS_KEY]);
const STAMP_RE = /(`@keber\/qa-framework` v)([0-9][0-9A-Za-z.+-]*)/;

// Folder (under the project root) that holds every backup upgrade makes. No agent loads
// it: Claude Code reads .claude/agents/, .claude/commands/, .claude/rules/ and
// .claude/skills/; Copilot reads .github/instructions/, .github/skills/ and friends.
const BACKUP_ROOT = '.claude/qa-framework-backup';
const REPORT_NAME = 'TRIAGE.md';

// ---------------------------------------------------------------------------
// Normalization and hashing
// ---------------------------------------------------------------------------

const isMarked = (key) => key.startsWith(COMMANDS_PREFIX);

/** Normalized form of `text` for the file at `key`, the form every hash is taken on. */
function normalizeFor(key, text) {
  let t = normalizeNewlines(text);
  if (isMarked(key)) t = splitGenerated(t).body;
  if (STAMPED_KEYS.has(key)) t = t.replace(STAMP_RE, '$1{{VERSION}}');
  return t;
}

function fileHash(normalized) {
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, FILE_HASH_CHARS);
}

/** Lines of a normalized text; a final newline ends the last line, it does not add one. */
function splitLines(normalized) {
  const lines = normalized.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function lineHash(line) {
  return crypto.createHash('sha256').update(line, 'utf8').digest('base64url').slice(0, LINE_HASH_CHARS);
}

function lineHashes(normalized) {
  return splitLines(normalized).map(lineHash);
}

// ---------------------------------------------------------------------------
// The force-written files of a package
// ---------------------------------------------------------------------------

function walkFiles(dir, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const child = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkFiles(dir, child));
    else out.push(child);
  }
  return out.sort();
}

/**
 * Every file upgrade force-writes, with this package's content in normalized form:
 *   [{ key, base }]
 * The base of a stamped file keeps {{VERSION}}; the base of a command has no marker.
 */
function currentOwnedFiles(pkgRoot) {
  const out = [];
  const skillsDir = path.join(pkgRoot, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const rel of walkFiles(skillsDir)) {
      const key = SKILLS_PREFIX + rel;
      out.push({ key, base: normalizeFor(key, fs.readFileSync(path.join(skillsDir, ...rel.split('/')), 'utf8')) });
    }
  }
  for (const name of discoverSkillNames(skillsDir)) {
    const key = COMMANDS_PREFIX + commandFileName(name);
    out.push({ key, base: normalizeFor(key, buildCommandBody(name)) });
  }
  const templates = [
    [RULES_KEY, path.join(pkgRoot, 'templates', 'qa-framework.rules.md')],
    [INSTRUCTIONS_KEY, path.join(pkgRoot, 'templates', 'qa-framework.instructions.md')],
    [GUIDE_KEY, path.join(pkgRoot, 'docs', 'folder-structure-guide.md')],
  ];
  for (const [key, file] of templates) {
    if (fs.existsSync(file)) out.push({ key, base: normalizeFor(key, fs.readFileSync(file, 'utf8')) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Manifest: encoding (used by the generator) and decoding (used by upgrade)
// ---------------------------------------------------------------------------

/**
 * Encodes the line sequences of one file's versions as ranges into
 * T = baseLines ++ extras, appending to `extras` only lines that cannot be referenced.
 * Returns { seqs, extras } with one seq per input sequence.
 */
function encodeSequences(baseLines, sequences) {
  const table = baseLines.slice();
  const extras = [];
  const positions = new Map();
  const index = (i) => {
    const list = positions.get(table[i]);
    if (list) list.push(i);
    else positions.set(table[i], [i]);
  };
  for (let i = 0; i < table.length; i++) index(i);

  const seqs = sequences.map((seq) => {
    const ranges = [];
    const emit = (start, length) => {
      const last = ranges.length - 2;
      if (last >= 0 && ranges[last] + ranges[last + 1] === start) ranges[last + 1] += length;
      else ranges.push(start, length);
    };
    let i = 0;
    while (i < seq.length) {
      let bestStart = -1;
      let bestLength = 0;
      for (const p of positions.get(seq[i]) || []) {
        let k = 0;
        while (i + k < seq.length && p + k < table.length && table[p + k] === seq[i + k]) k++;
        if (k > bestLength) {
          bestLength = k;
          bestStart = p;
        }
      }
      if (bestLength > 0) {
        emit(bestStart, bestLength);
        i += bestLength;
      } else {
        table.push(seq[i]);
        extras.push(seq[i]);
        index(table.length - 1);
        emit(table.length - 1, 1);
        i++;
      }
    }
    return ranges;
  });
  return { seqs, extras };
}

function decodeSequence(table, ranges) {
  const out = [];
  for (let r = 0; r < ranges.length; r += 2) {
    for (let i = ranges[r]; i < ranges[r] + ranges[r + 1]; i++) out.push(table[i]);
  }
  return out;
}

/** The manifest shipped with this package, or null when it is missing or unreadable. */
function loadManifest(file = MANIFEST_PATH) {
  try {
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (manifest.format !== MANIFEST_FORMAT || typeof manifest.lines !== 'string' || !manifest.files) return null;
    return manifest;
  } catch {
    return null;
  }
}

/**
 * Line hashes of every shipped version of `key`, oldest first:
 *   [{ tags, hash, lines }]
 * `base` is this package's normalized content. Returns null when the manifest cannot
 * describe this file's lines (unknown key, or a manifest built from other content).
 */
function versionLines(manifest, key, base) {
  const entry = manifest && manifest.files[key];
  if (!entry || entry.current !== fileHash(base)) return null;
  const width = manifest.lineHashChars;
  const [first, count] = entry.x;
  const table = lineHashes(base);
  for (let i = first; i < first + count; i++) table.push(manifest.lines.slice(i * width, (i + 1) * width));
  return entry.versions.map((v) => ({ tags: v.tags, hash: v.hash, lines: decodeSequence(table, v.seq) }));
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Ownership of the project file at `key`, given what this release writes there.
 *   { state: 'unchanged' | 'pristine' | 'edited', reason }
 * reason: 'current' | 'marker' | 'shipped' | 'marker-mismatch' | 'hand-written' | 'unknown'
 */
function classify(manifest, key, existing, current) {
  if (existing === current) return { state: 'unchanged', reason: 'current' };
  const norm = normalizeFor(key, existing);
  if (norm === normalizeFor(key, current)) return { state: 'pristine', reason: 'current' };
  if (isMarked(key)) {
    const parts = splitGenerated(normalizeNewlines(existing));
    if (parts.marker) {
      return parts.intact ? { state: 'pristine', reason: 'marker' } : { state: 'edited', reason: 'marker-mismatch' };
    }
  }
  const entry = manifest && manifest.files[key];
  const hash = fileHash(norm);
  if (entry && entry.versions.some((v) => v.hash === hash)) return { state: 'pristine', reason: 'shipped' };
  return { state: 'edited', reason: isMarked(key) ? 'hand-written' : 'unknown' };
}

// ---------------------------------------------------------------------------
// Triage: lines the project added
// ---------------------------------------------------------------------------

// Above this many cells the exact diff is replaced by a membership test (each project
// line not found anywhere in the version counts as added). Only reached by files far
// larger than anything the framework ships.
const MAX_DIFF_CELLS = 25_000_000;

/** Indexes of `a` that are not part of a longest common subsequence with `b`. */
function addedIndexes(a, b) {
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++;
  let hiA = a.length;
  let hiB = b.length;
  while (hiA > lo && hiB > lo && a[hiA - 1] === b[hiB - 1]) {
    hiA--;
    hiB--;
  }
  const n = hiA - lo;
  const m = hiB - lo;
  if (n === 0) return [];
  if (m === 0) return Array.from({ length: n }, (_, i) => lo + i);
  if (n * m > MAX_DIFF_CELLS) {
    const known = new Set(b);
    const out = [];
    for (let i = lo; i < hiA; i++) if (!known.has(a[i])) out.push(i);
    return out;
  }
  // dp[i][j] = LCS length of a[lo+i..hiA) and b[lo+j..hiB), row-major (m+1) wide.
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] = a[lo + i] === b[lo + j]
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[lo + i] === b[lo + j]) {
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      out.push(lo + i);
      i++;
    } else {
      j++;
    }
  }
  for (; i < n; i++) out.push(lo + i);
  return out;
}

/**
 * Lines the project file adds to the version it most likely came from: the shipped
 * version with the fewest added lines (on a tie, the one with the fewest lines the
 * project lacks, then the newest). Falls back to this
 * release's content, flagged approximate, when no shipped version is known.
 *   { approximate, tags, added: [{ number, text }], missing }
 * `missing` counts lines of the compared version that the project file lacks.
 */
function triage(manifest, key, existing, current) {
  const display = splitLines(isMarked(key)
    ? splitGenerated(normalizeNewlines(existing)).body
    : normalizeNewlines(existing));
  const projectLines = lineHashes(normalizeFor(key, existing));
  const base = normalizeFor(key, current);
  const candidates = versionLines(manifest, key, base) || [];

  // Closest: fewest added lines, then fewest lines missing, then the newest version.
  let best = null;
  candidates.forEach((v) => {
    const added = addedIndexes(projectLines, v.lines);
    const missing = v.lines.length - (projectLines.length - added.length);
    if (!best || added.length < best.added.length ||
        (added.length === best.added.length && missing <= best.missing)) {
      best = { tags: v.tags, lines: v.lines, added, missing };
    }
  });
  let approximate = false;
  if (!best) {
    approximate = true;
    const lines = lineHashes(base);
    const added = addedIndexes(projectLines, lines);
    best = { tags: [], added, missing: lines.length - (projectLines.length - added.length) };
  }
  return {
    approximate,
    tags: best.tags,
    added: best.added.map((i) => ({ number: i + 1, text: display[i] })),
    missing: best.missing,
  };
}

/**
 * triage() for a file with no shipped baseline at all (for example the pre-1.7.0
 * .github/copilot-instructions.md, which init rendered inline from the config): every
 * line is listed, because none can be attributed to the framework.
 */
function triageWithoutBaseline(existing) {
  const display = splitLines(normalizeNewlines(existing));
  return {
    approximate: true,
    noBaseline: true,
    tags: [],
    added: display.map((text, i) => ({ number: i + 1, text })),
    missing: 0,
  };
}

// ---------------------------------------------------------------------------
// Backups and the report
// ---------------------------------------------------------------------------

/**
 * Path of a file's backup inside a run folder: its project-relative path, with the
 * leading dot of the first segment dropped (.claude/rules/x.md -> claude/rules/x.md),
 * so that no tool that discovers nested .claude/ or .github/ folders loads it.
 */
function backupRelPath(key) {
  const segments = key.split('/');
  segments[0] = segments[0].replace(/^\.+/, '');
  return segments.join('/');
}

/** Characters the report may carry as they are: ASCII and Latin-1 / Latin Extended letters. */
function escapeForReport(text) {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 9 || (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0x24f)) out += ch;
    else out += `<U+${cp.toString(16).toUpperCase().padStart(4, '0')}>`;
  }
  return out;
}

function hunks(added) {
  const out = [];
  for (const line of added) {
    const last = out[out.length - 1];
    if (last && last[last.length - 1].number === line.number - 1) last.push(line);
    else out.push([line]);
  }
  return out;
}

function fenceFor(lines) {
  let longest = 2;
  for (const l of lines) for (const run of l.match(/`+/g) || []) longest = Math.max(longest, run.length);
  return '`'.repeat(longest + 1);
}

/**
 * Markdown triage report for one upgrade run.
 *   toVersion  the version upgrade installed
 *   runDir     the run folder, project-relative and '/' separated
 *   entries    [{ key, backup, result: triage() output, note? }]
 */
function renderTriageReport({ toVersion, runDir, entries }) {
  const out = [
    '# qa-framework upgrade - triage report',
    '',
    `Upgrade to ${toVersion}. Upgrade saved each file or folder below in this folder (same`,
    'relative path, without the leading dot of `.claude` or `.github`) before it overwrote,',
    'removed or moved it.',
    '',
    `Folder: \`${runDir}/\``,
    '',
    'For every added line, decide: already in the framework (drop it), specific to this',
    'project (move it to a file the project owns, such as `.claude/rules/<project>.md` or',
    '`.github/instructions/<project>.instructions.md`), or a framework gap (propose it',
    'upstream). Characters outside ASCII and Latin letters are written as <U+XXXX>; the',
    'backup keeps the exact bytes.',
  ];
  for (const { key, backup, result, note, movedTo } of entries) {
    if (movedTo) {
      out.push(
        '',
        `## ${key}`,
        '',
        `- Backup: \`${backup}\``,
        `- Moved to: \`${movedTo}\``,
        '- The move did not change the content: nothing to triage.',
      );
      continue;
    }
    let compared;
    if (result.noBaseline) {
      compared = `no shipped baseline (${note || 'the framework has no record of the version this file came from'}), ` +
        'so the whole file is listed';
    } else if (!result.approximate) {
      const [first, ...rest] = result.tags;
      compared = `${first} (closest shipped version by line overlap` +
        (rest.length ? `; the same content shipped in ${rest.join(', ')})` : ')');
    } else {
      compared = `this release's version (approximate: ${note || 'no shipped version of this file is known'}, ` +
        'so the lines are relative to the new framework version, not to the version the file came from)';
    }
    out.push(
      '',
      `## ${key}`,
      '',
      `- Backup: \`${backup}\``,
      `- Compared with: ${compared}`,
      `- Lines added by the project: ${result.added.length}`,
      `- Lines of that version missing from the project file: ${result.missing}`,
    );
    for (const hunk of hunks(result.added)) {
      const first = hunk[0].number;
      const last = hunk[hunk.length - 1].number;
      const texts = hunk.map((l) => escapeForReport(l.text));
      const fence = fenceFor(texts);
      out.push('', first === last ? `Project line ${first}:` : `Project lines ${first}-${last}:`, '', `${fence}text`, ...texts, fence);
    }
  }
  return `${out.join('\n')}\n`;
}

module.exports = {
  MANIFEST_PATH,
  MANIFEST_FORMAT,
  FILE_HASH_CHARS,
  LINE_HASH_CHARS,
  BACKUP_ROOT,
  REPORT_NAME,
  STAMPED_KEYS,
  normalizeFor,
  fileHash,
  lineHashes,
  currentOwnedFiles,
  encodeSequences,
  decodeSequence,
  loadManifest,
  versionLines,
  classify,
  addedIndexes,
  triage,
  triageWithoutBaseline,
  backupRelPath,
  escapeForReport,
  renderTriageReport,
  stampGenerated,
};
