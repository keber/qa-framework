#!/usr/bin/env node
/**
 * check-spanish-accents.js
 *
 * Fails when a Markdown file whose prose is Spanish carries no accented characters.
 *
 * Why this exists: a spec written as "Codigo" while the UI renders "Código" produces a
 * page-object selector that never matches. In one project that cost 24 of 39 failing smoke
 * tests and two wrong mitigations (raising a timeout, forcing HTTP/1.1) before the real
 * cause was found, because the failure presents as a timeout, not as a text mismatch.
 * Accent stripping is a defect, not a house style - and its measured incidence in
 * agent-generated artifacts is high enough that honor-system compliance does not hold.
 *
 * The hard part is not detecting missing accents; it is deciding which files are Spanish.
 * A naive "every .md must contain accents" rule fails every legitimately English artifact
 * the framework ships. Counting Spanish marker words in raw text does not separate them
 * either: an English document about a Spanish-language project quotes enough Spanish paths,
 * identifiers and snippets to cross any absolute threshold that still catches short
 * Spanish files.
 *
 * So this classifies on the density of Spanish function words in PROSE ONLY, after
 * stripping fenced code, inline code, link targets, HTML tags and table pipes. English
 * prose that merely cites Spanish identifiers scores low because those citations live in
 * the stripped regions; real Spanish prose scores high because its function words are
 * spread through the sentences themselves.
 *
 * Usage:
 *   node scripts/check-spanish-accents.js <file|dir> [...]   check paths
 *   node scripts/check-spanish-accents.js --staged           check staged .md files
 *   node scripts/check-spanish-accents.js --report <paths>   print scores, never fail
 *
 * Exit codes: 0 = clean, 1 = at least one Spanish file has no accents, 2 = usage error.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Function words that are unavoidable in real Spanish prose and rare in English text.
// Deliberately excludes "no", "a", "en", "es" and other tokens that collide with English
// or with code, and excludes accented forms so a stripped file is not penalised twice.
const MARKERS = [
  'que', 'para', 'con', 'por', 'los', 'las', 'del', 'una', 'como', 'pero',
  'este', 'esta', 'estos', 'estas', 'sin', 'sobre', 'desde', 'cuando', 'donde',
  'cada', 'todo', 'todos', 'toda', 'todas', 'entre', 'hasta', 'porque', 'segun',
  'debe', 'deben', 'ser', 'son', 'hay', 'muy', 'ya', 'si', 'lo', 'le', 'se',
];

const ACCENTED = /[áéíóúÁÉÍÓÚñÑüÜ]/;

// A file is Spanish when at least this share of its prose words are Spanish markers.
// Calibrated against this package's own corpus: Spanish agent templates land near 0.13,
// English skill files and the FRAMEWORK-FIXES reports stay below 0.03.
const DENSITY_THRESHOLD = 0.07;
// Below this many prose words the density estimate is too noisy to act on.
const MIN_PROSE_WORDS = 60;

/** Remove every region where Spanish tokens are citations rather than prose. */
function extractProse(markdown) {
  return markdown
    .replace(/^---\n[\s\S]*?\n---/, ' ')      // YAML frontmatter
    .replace(/```[\s\S]*?```/g, ' ')          // fenced code
    .replace(/~~~[\s\S]*?~~~/g, ' ')          // fenced code, alt syntax
    .replace(/`[^`\n]*`/g, ' ')               // inline code
    .replace(/\]\([^)]*\)/g, '] ')            // link targets, keep link text
    .replace(/<[^>\n]*>/g, ' ')               // HTML tags and <placeholders>
    .replace(/\{\{[^}]*\}\}/g, ' ')           // {{TEMPLATE_PLACEHOLDERS}}
    .replace(/\|/g, ' ')                      // table pipes
    .replace(/^\s{4,}\S.*$/gm, ' ')           // indented code blocks
    .replace(/[A-Za-z0-9_.\-]+\/[A-Za-z0-9_./\-]+/g, ' ') // bare paths
    .replace(/[#*_>[\]]/g, ' ');              // remaining markdown punctuation
}

function score(markdown) {
  const prose = extractProse(markdown);
  const words = prose.toLowerCase().match(/[a-zà-ÿ]+/g) || [];
  const markers = words.filter((w) => MARKERS.includes(w)).length;
  const density = words.length ? markers / words.length : 0;
  return {
    words: words.length,
    markers,
    density,
    isSpanish: words.length >= MIN_PROSE_WORDS && density >= DENSITY_THRESHOLD,
    hasAccents: ACCENTED.test(markdown),
  };
}

function collect(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return target.endsWith('.md') ? [target] : [];
  return fs.readdirSync(target).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.git') return [];
    return collect(path.join(target, entry));
  });
}

function stagedMarkdown() {
  const out = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACM', '--', '*.md'],
    { encoding: 'utf8' }
  );
  return out.split('\n').map((s) => s.trim()).filter((s) => s && fs.existsSync(s));
}

function main(argv) {
  const reportOnly = argv.includes('--report');
  const args = argv.filter((a) => a !== '--report');

  let files;
  if (args.includes('--staged')) {
    files = stagedMarkdown();
  } else if (args.length) {
    files = args.flatMap(collect);
  } else {
    console.error('usage: check-spanish-accents.js <file|dir>... | --staged [--report]');
    return 2;
  }

  const failures = [];
  for (const file of files) {
    const result = score(fs.readFileSync(file, 'utf8'));
    if (reportOnly) {
      console.log(
        `${result.isSpanish ? 'ES' : 'en'}  density=${result.density.toFixed(3)}  ` +
        `words=${String(result.words).padStart(5)}  accents=${result.hasAccents ? 'yes' : 'NO '}  ${file}`
      );
    }
    if (result.isSpanish && !result.hasAccents) failures.push({ file, ...result });
  }

  if (reportOnly) return 0;

  if (failures.length) {
    console.error('\nSpanish Markdown without accented characters:\n');
    for (const f of failures) {
      console.error(`  ${f.file}`);
      console.error(
        `    ${f.markers} Spanish markers in ${f.words} prose words ` +
        `(density ${f.density.toFixed(3)}), 0 accented characters.`
      );
    }
    console.error(
      '\nSpanish prose must carry its accents: a spec saying "Codigo" does not match a UI' +
      '\nthat renders "Código", and the resulting selector failure looks like a timeout.' +
      '\nFix the orthography rather than bypassing this check.\n'
    );
    return 1;
  }

  console.log(`check-spanish-accents: ${files.length} file(s) checked, no violations.`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { score, extractProse, MARKERS, DENSITY_THRESHOLD };
