#!/usr/bin/env node
/**
 * scripts/build-ownership-manifest.js - Regenerate scripts/lib/ownership-manifest.json
 *
 * Repository tool, NOT published (package.json "files" excludes it): it reads the git
 * history, which an installed package does not have.
 *
 * Usage (from a full clone with tags, e.g. after `git fetch --tags`):
 *   npm run build:ownership-manifest            write the manifest
 *   node scripts/build-ownership-manifest.js --check
 *                                               exit 1 if the file on disk is stale
 *
 * For every release tag v<semver>, and then for the working tree, it reproduces what
 * that release force-wrote into a project, the way that release rendered it:
 *   - .github/skills/**                 skills/** copied verbatim
 *   - .claude/commands/<skill>.md       buildCommandContent() of that release's
 *                                       scripts/lib/claude-commands.js, one per skill
 *   - .claude/rules/qa-framework.md     templates/qa-framework.rules.md
 *   - .github/instructions/qa-framework.instructions.md
 *                                       templates/qa-framework.instructions.md
 *   - qa/QA-STRUCTURE-GUIDE.md          docs/folder-structure-guide.md
 * Every content is normalized with ownership.normalizeFor() (BOM, CRLF, marker,
 * {{VERSION}}, {{DEFECT_PREFIX}}) and recorded once per distinct content, with the releases that shipped
 * it. Only files this release still force-writes are recorded.
 *
 * Not reproducible, and therefore never recognised as pristine (an existing copy is
 * backed up before it is overwritten, which loses nothing): v1.7.0's instructions,
 * which upgrade rendered from the project config with an inline function, and the
 * {{ADO_SECTION}} that init (not upgrade) rendered from the config in v1.7.1 to v1.10.0.
 *
 * Run it whenever a skill, a template above, the guide or the command wrapper text
 * changes: test/upgrade-ownership.test.js fails until the manifest is regenerated.
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { normalizeNewlines } = require('./lib/generated-marker');
const ownership = require('./lib/ownership');
const rulesTemplate = require('./lib/rules-template');

const REPO_ROOT = path.resolve(__dirname, '..');
const PKG_VERSION = require(path.join(REPO_ROOT, 'package.json')).version;
const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

function git(...args) {
  return execFileSync('git', ['-C', REPO_ROOT, ...args], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// Semver precedence, enough for this repository's tags (numeric and dotted prereleases).
function compareTags(a, b) {
  const pa = a.match(TAG_RE);
  const pb = b.match(TAG_RE);
  for (let i = 1; i <= 3; i++) if (Number(pa[i]) !== Number(pb[i])) return Number(pa[i]) - Number(pb[i]);
  if (!pa[4] || !pb[4]) return (pa[4] ? -1 : 0) - (pb[4] ? -1 : 0);
  const xa = pa[4].split('.');
  const xb = pb[4].split('.');
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    if (xa[i] === undefined) return -1;
    if (xb[i] === undefined) return 1;
    const na = /^\d+$/.test(xa[i]);
    const nb = /^\d+$/.test(xb[i]);
    if (na && nb && Number(xa[i]) !== Number(xb[i])) return Number(xa[i]) - Number(xb[i]);
    if (na !== nb) return na ? -1 : 1;
    if (xa[i] !== xb[i]) return xa[i] < xb[i] ? -1 : 1;
  }
  return 0;
}

function releaseTags() {
  return git('tag', '-l', 'v*').split('\n').map((t) => t.trim()).filter((t) => TAG_RE.test(t)).sort(compareTags);
}

// The rules and instructions templates are rendered by rulesTemplate.renderRulesTemplate()
// ({{VERSION}} once, and {{DEFECT_PREFIX}} from conventions.defectIdPattern since 1.14.0).
// The manifest records them unrendered, which is only sound while normalizeFor() undoes
// every substitution: refuse to build otherwise rather than record a wrong "shipped"
// content. Checked with a prefixed, an empty and the generic rendering of the prefix.
const SAMPLE_CONFIGS = [
  { conventions: { defectIdPattern: 'DEF-QZX-{NUM}' } },
  { conventions: { defectIdPattern: 'DEF-{NUM}' } },
  {},
];
function checkStampedTemplate(tag, key, template) {
  const count = template.split(rulesTemplate.VERSION_PLACEHOLDER).length - 1;
  for (const config of SAMPLE_CONFIGS) {
    const rendered = rulesTemplate.renderRulesTemplate(template, '9.8.7-rc.6', config);
    const ctx = rulesTemplate.renderContext(config);
    if (count > 1 || /\{\{[A-Z_]+\}\}/.test(rendered) ||
        ownership.normalizeFor(key, rendered, ctx) !== ownership.normalizeFor(key, template)) {
      throw new Error(`${tag}: ${key} no longer renders as the substitutions normalizeFor() undoes; ` +
        'update scripts/lib/rules-template.js, normalizeFor() in scripts/lib/ownership.js and this generator together.');
    }
  }
}

/** key -> normalized content force-written by release `tag`. */
function filesAtTag(tag) {
  const out = new Map();
  const names = git('ls-tree', '-r', '--name-only', tag).split('\n').filter(Boolean);
  const show = (p) => git('show', `${tag}:${p}`);
  const has = new Set(names);

  for (const p of names.filter((n) => n.startsWith('skills/'))) {
    const key = `.github/skills/${p.slice('skills/'.length)}`;
    out.set(key, ownership.normalizeFor(key, show(p)));
  }
  if (has.has('docs/folder-structure-guide.md')) {
    out.set('qa/QA-STRUCTURE-GUIDE.md', ownership.normalizeFor('qa/QA-STRUCTURE-GUIDE.md', show('docs/folder-structure-guide.md')));
  }
  const stamped = [
    ['.claude/rules/qa-framework.md', 'templates/qa-framework.rules.md'],
    ['.github/instructions/qa-framework.instructions.md', 'templates/qa-framework.instructions.md'],
  ];
  for (const [key, p] of stamped) {
    if (!has.has(p)) continue;
    // v1.7.1 to v1.10.0 also had {{ADO_SECTION}} in the instructions: upgrade rendered
    // it as '' (init rendered it from the config, which cannot be reproduced here).
    const template = show(p).replace('{{ADO_SECTION}}', '');
    checkStampedTemplate(tag, key, template);
    out.set(key, ownership.normalizeFor(key, template));
  }
  if (has.has('scripts/lib/claude-commands.js')) {
    // Run that release's own wrapper code: copy its scripts/lib/ to a temp folder.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-manifest-'));
    try {
      for (const p of names.filter((n) => /^scripts\/lib\/[^/]+\.js$/.test(n))) {
        fs.writeFileSync(path.join(dir, path.basename(p)), show(p));
      }
      const lib = require(path.join(dir, 'claude-commands.js'));
      const skills = [...new Set(names.filter((n) => n.startsWith('skills/')).map((n) => n.split('/')[1]))].sort();
      for (const name of skills) {
        const key = `.claude/commands/${lib.commandFileName ? lib.commandFileName(name) : `${name}.md`}`;
        out.set(key, ownership.normalizeFor(key, lib.buildCommandContent(name)));
      }
    } finally {
      for (const id of Object.keys(require.cache)) if (id.startsWith(dir)) delete require.cache[id];
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  return out;
}

function buildManifest() {
  const tags = releaseTags();
  if (tags.length === 0) throw new Error('No release tags found. Run from a full clone: git fetch --tags');
  const current = ownership.currentOwnedFiles(REPO_ROOT);
  const keys = new Set(current.map((f) => f.key));

  // key -> [{ tags, content }] in release order, one entry per distinct content.
  const history = new Map(current.map((f) => [f.key, []]));
  const record = (key, label, content) => {
    const versions = history.get(key);
    const same = versions.find((v) => v.content === content);
    if (same) {
      if (label && !same.tags.includes(label)) same.tags.push(label);
    } else {
      versions.push({ tags: label ? [label] : [], content });
    }
  };
  for (const tag of tags) {
    for (const [key, content] of filesAtTag(tag)) if (keys.has(key)) record(key, tag.slice(1), content);
  }
  // The working tree: what this package ships. Labelled with the package version unless
  // that version is already tagged, in which case it is unreleased work after it.
  const tagged = tags.includes(`v${PKG_VERSION}`);
  for (const f of current) {
    const versions = history.get(f.key);
    if (!versions.some((v) => v.content === f.base)) record(f.key, tagged ? `${PKG_VERSION}+dev` : PKG_VERSION, f.base);
    else if (!tagged) record(f.key, PKG_VERSION, f.base);
  }

  let lines = '';
  let lineCount = 0;
  const files = {};
  for (const f of current) {
    const versions = history.get(f.key);
    const seqsIn = versions.map((v) => ownership.lineHashes(v.content));
    const { seqs, extras } = ownership.encodeSequences(ownership.lineHashes(f.base), seqsIn);
    files[f.key] = {
      current: ownership.fileHash(f.base),
      x: [lineCount, extras.length],
      versions: versions.map((v, i) => ({ tags: v.tags, hash: ownership.fileHash(v.content), seq: seqs[i] })),
    };
    lines += extras.join('');
    lineCount += extras.length;
  }
  const manifest = {
    format: ownership.MANIFEST_FORMAT,
    generator: 'scripts/build-ownership-manifest.js - do not edit by hand',
    releases: `${tags[0].slice(1)} to ${tags[tags.length - 1].slice(1)}, plus the working tree at ${PKG_VERSION}`,
    fileHashChars: ownership.FILE_HASH_CHARS,
    lineHashChars: ownership.LINE_HASH_CHARS,
    lines,
    files,
  };

  // Round trip: every version must decode to exactly the lines it was built from.
  for (const f of current) {
    const decoded = ownership.versionLines(manifest, f.key, f.base);
    const original = history.get(f.key);
    decoded.forEach((v, i) => {
      if (v.lines.join('') !== ownership.lineHashes(original[i].content).join('')) {
        throw new Error(`${f.key}: version ${v.tags.join(',')} does not decode to its own lines`);
      }
    });
  }
  return manifest;
}

// One file entry per line keeps diffs of the manifest readable.
function serialize(manifest) {
  const { files, ...head } = manifest;
  const headJson = JSON.stringify(head);
  const body = Object.keys(files).map((k) => `${JSON.stringify(k)}:${JSON.stringify(files[k])}`).join(',\n');
  return `${headJson.slice(0, -1)},"files":{\n${body}\n}}\n`;
}

// --check compares line-ending agnostic: a Windows checkout (core.autocrlf=true) has the
// manifest with CRLF endings, which is the same content. The hashes inside are already
// line-ending agnostic: every content goes through ownership.normalizeFor() (BOM and
// CRLF dropped) before it is hashed, exactly as upgrade does with a project's files.
function isUpToDate(onDisk, generated) {
  return normalizeNewlines(onDisk) === normalizeNewlines(generated);
}

function main() {
  const check = process.argv.includes('--check');
  const text = serialize(buildManifest());
  if (check) {
    const onDisk = fs.existsSync(ownership.MANIFEST_PATH) ? fs.readFileSync(ownership.MANIFEST_PATH, 'utf8') : '';
    if (!isUpToDate(onDisk, text)) {
      console.error('[build-ownership-manifest] scripts/lib/ownership-manifest.json is stale. Run: npm run build:ownership-manifest');
      process.exitCode = 1;
      return;
    }
    console.log('[build-ownership-manifest] up to date.');
    return;
  }
  fs.writeFileSync(ownership.MANIFEST_PATH, text, 'utf8');
  const keys = Object.keys(JSON.parse(text).files).length;
  console.log(`[build-ownership-manifest] wrote ${path.relative(REPO_ROOT, ownership.MANIFEST_PATH)}: ` +
    `${keys} files, ${Buffer.byteLength(text)} bytes.`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[build-ownership-manifest] ERROR: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { compareTags, isUpToDate, serialize };
