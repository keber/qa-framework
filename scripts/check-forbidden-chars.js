#!/usr/bin/env node
/**
 * check-forbidden-chars.js
 *
 * Enforces the BLOCKING character-safety rule declared in
 * .github/copilot-instructions.md: generated content must never carry typographic
 * characters that survive a copy-paste but break on the way to a terminal, a CSV,
 * a PowerShell script or an Azure DevOps field.
 *
 * Forbidden: em-dash (U+2014), en-dash (U+2013), horizontal ellipsis (U+2026),
 * smart quotes (U+201C, U+201D, U+2018, U+2019) and arrows (U+2190-U+21FF).
 * Each has an ASCII equivalent that renders identically everywhere.
 *
 * Latin Extended (U+00C0-U+024F) is explicitly NOT flagged: Spanish accents,
 * n with tilde and u/o with umlaut are required orthography, not decoration.
 * Emoji are not flagged either - they are outside the forbidden set.
 *
 * Unlike check-spanish-accents.js this scans .js and .ts as well as .md, because
 * the generators under scripts/ embed these characters in template literals and
 * console output that propagate into every consuming project.
 *
 * Usage:
 *   node scripts/check-forbidden-chars.js <file|dir> [...]   check paths
 *   node scripts/check-forbidden-chars.js --staged           check staged files
 *   node scripts/check-forbidden-chars.js --report <paths>   print findings, never fail
 *
 * Exit codes: 0 = clean, 1 = at least one forbidden character, 2 = usage error.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const EXTENSIONS = ['.md', '.js', '.ts'];

// Code point -> { name, replacement }. Arrows are handled by range below.
const FORBIDDEN = {
  0x2014: { name: 'em dash', replacement: ' - ' },
  0x2013: { name: 'en dash', replacement: ' - ' },
  0x2026: { name: 'horizontal ellipsis', replacement: '...' },
  0x201c: { name: 'left double quotation mark', replacement: '"' },
  0x201d: { name: 'right double quotation mark', replacement: '"' },
  0x2018: { name: 'left single quotation mark', replacement: "'" },
  0x2019: { name: 'right single quotation mark', replacement: "'" },
};

const ARROW_START = 0x2190;
const ARROW_END = 0x21ff;

// The two arrows with an obvious ASCII spelling; every other arrow in the block
// has no single equivalent, so the report asks for a rewrite instead of guessing.
const ARROW_REPLACEMENTS = {
  0x2190: '<-',
  0x2192: '->',
};

function describe(codePoint) {
  if (FORBIDDEN[codePoint]) return FORBIDDEN[codePoint];
  if (codePoint >= ARROW_START && codePoint <= ARROW_END) {
    return {
      name: 'arrow',
      replacement: ARROW_REPLACEMENTS[codePoint] || 'an ASCII arrow such as -> or <-',
    };
  }
  return null;
}

function hex(codePoint) {
  return 'U+' + codePoint.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Scan one file's text. Returns an array of findings; column is 1-based and
 * counted in code points, so an astral character earlier on the line does not
 * shift the reported position.
 */
function scanText(text, file) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, lineIndex) => {
    let column = 0;
    for (const char of line) {
      column += 1;
      const codePoint = char.codePointAt(0);
      const match = describe(codePoint);
      if (!match) continue;
      findings.push({
        file,
        line: lineIndex + 1,
        column,
        char,
        codePoint,
        name: match.name,
        replacement: match.replacement,
        text: line.trim(),
      });
    }
  });

  return findings;
}

function scanFile(file) {
  return scanText(fs.readFileSync(file, 'utf8'), file);
}

function collect(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return EXTENSIONS.includes(path.extname(target)) ? [target] : [];
  return fs.readdirSync(target).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.git') return [];
    return collect(path.join(target, entry));
  });
}

function stagedFiles() {
  const out = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACM'],
    { encoding: 'utf8' }
  );
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && EXTENSIONS.includes(path.extname(s)) && fs.existsSync(s));
}

function main(argv) {
  const reportOnly = argv.includes('--report');
  const args = argv.filter((a) => a !== '--report');

  let files;
  if (args.includes('--staged')) {
    files = stagedFiles();
  } else if (args.length) {
    files = args.flatMap(collect);
  } else {
    console.error('usage: check-forbidden-chars.js <file|dir>... | --staged [--report]');
    return 2;
  }

  const findings = files.flatMap(scanFile);

  if (findings.length) {
    const stream = reportOnly ? console.log : console.error;
    stream(`\nForbidden characters (${findings.length} occurrence(s)):\n`);
    for (const f of findings) {
      stream(`  ${f.file}:${f.line}:${f.column}  "${f.char}" ${hex(f.codePoint)} ${f.name}`);
      stream(`    use ${f.replacement}`);
      stream(`    ${f.text}`);
    }
    if (!reportOnly) {
      stream(
        '\nThese characters break on the way to a terminal, a CSV export or an Azure' +
        '\nDevOps field. Replace them with their ASCII equivalents rather than' +
        '\nbypassing this check. Spanish accents are permitted and are never flagged.\n'
      );
      return 1;
    }
    return 0;
  }

  if (reportOnly) {
    console.log(`check-forbidden-chars: ${files.length} file(s) checked, no findings.`);
    return 0;
  }

  console.log(`check-forbidden-chars: ${files.length} file(s) checked, no violations.`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { scanText, scanFile, main, EXTENSIONS, FORBIDDEN, ARROW_START, ARROW_END };
