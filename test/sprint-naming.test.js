'use strict';

// Sprint folders and plan names use the sprint number WITHOUT zero padding:
// qa/02-test-plans/sprints/Sprint-{N}/Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md
//
// Code evidence for the canonical form: init.js and upgrade.js write the
// 02-test-plans/README.md with `Sprint-{N}`, the md-to-tc-mapping.ps1 examples use
// Sprint-2 and Sprint-10, and the sprint agents say "sin padding" (Sprint-12). No code
// creates or parses a Sprint-* folder name, so this is a documentation contract: the
// padded placeholder ({NNN}, {{NNN}}) or a zero-padded literal (Sprint-007) must not
// come back in any shipped skill, template, doc or the README.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// package.json "files" excludes some docs (repository notes, not shipped).
const NOT_SHIPPED = new Set(
  require(path.join(ROOT, 'package.json')).files
    .filter((f) => f.startsWith('!docs/'))
    .map((f) => f.slice(1)),
);

function walk(rel) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(child));
    else out.push(child);
  }
  return out;
}

function shippedFiles() {
  const docs = walk('docs').filter((f) => f.endsWith('.md') && !NOT_SHIPPED.has(f));
  return [...walk('skills'), ...walk('templates'), ...docs, 'README.md'];
}

const PADDED = [
  /Sprint[-_ ]\{\{?NNN\}\}?/i,           // Sprint-{NNN}, Sprint {{NNN}}, sprint-{NNN}
  /\*\*Sprint:\*\*\s*\{\{?NNN\}\}?/i,   // **Sprint:** {NNN}
  /--sprint\s+\{\{?NNN\}\}?/i,           // consolidate-sprint --sprint {{NNN}}
  /Sprint-0\d/i,                         // Sprint-007
  /zero-padded sprint/i,                 // a definition that prescribes padding
];

test('sprint naming: shipped files never use a zero-padded sprint number', () => {
  const files = shippedFiles();
  assert.ok(files.some((f) => f.startsWith('skills/')) && files.includes('docs/folder-structure-guide.md'));
  const offenders = [];
  for (const rel of files) {
    const lines = fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      if (PADDED.some((re) => re.test(line))) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `padded sprint numbers (use Sprint-{N}):\n${offenders.join('\n')}`);
});

test('sprint naming: the folder guide states the canonical unpadded form', () => {
  const guide = fs.readFileSync(path.join(ROOT, 'docs', 'folder-structure-guide.md'), 'utf8');
  assert.match(guide, /sprints\/Sprint-\{N\}\//);
  assert.match(guide, /`Plan-de-Pruebas-\{proyecto\}-Sprint-\{N\}-\{modulo\}\.md`/);
  assert.match(guide, /without zero padding/i);
});

test('sprint naming: what init and upgrade write uses the canonical form', () => {
  for (const rel of ['scripts/init.js', 'scripts/upgrade.js']) {
    const src = fs.readFileSync(path.join(ROOT, ...rel.split('/')), 'utf8');
    assert.match(src, /sprints\/Sprint-\{N\}\/Plan-de-Pruebas-\{project\}-Sprint-\{N\}-\{module\}\.md/, rel);
    for (const re of PADDED) assert.doesNotMatch(src, re, rel);
  }
});
