#!/usr/bin/env node
'use strict';

/**
 * release-guard.js - decides whether a tag push may publish, and under which
 * npm dist-tag. Invoked by .github/workflows/publish.yml before `npm publish`.
 *
 * Rules:
 *   - The tag must be `vMAJOR.MINOR.PATCH` with an optional semver prerelease
 *     suffix (`-rc.1`). Build metadata (`+...`) is rejected: npm drops it, so
 *     the published version could never match the tag.
 *   - package.json `version` must equal the tag without the leading `v`.
 *   - A prerelease tag publishes under `next`.
 *   - A plain tag publishes under `latest`, and only if the tagged commit is an
 *     ancestor of the main branch ref (default `origin/main`).
 *
 * This file lives under .github/ on purpose: it is release tooling for this
 * repository and must not ship in the npm package (`scripts/` is in `files`).
 *
 * CLI:
 *   node .github/scripts/release-guard.js --tag <tag> [--main-ref origin/main] [--commit HEAD]
 *
 * On success prints the dist-tag to stdout and, when GITHUB_OUTPUT is set,
 * appends `dist-tag=<value>` to it. On failure prints `release-guard: <reason>`
 * to stderr and exits 1, writing nothing to stdout or GITHUB_OUTPUT.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const NUM = '(?:0|[1-9]\\d*)';
const PRE_ID = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)';
const TAG_RE = new RegExp(`^v(${NUM}\\.${NUM}\\.${NUM}(?:-(${PRE_ID}(?:\\.${PRE_ID})*))?)$`);

/**
 * @param {string} tag
 * @returns {{ version: string, prerelease: boolean }}
 */
function parseTag(tag) {
  const m = typeof tag === 'string' ? TAG_RE.exec(tag) : null;
  if (!m) {
    throw new Error(
      `Malformed release tag ${JSON.stringify(tag)}: expected vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-<prerelease> (e.g. v1.14.0 or v1.14.0-rc.1).`,
    );
  }
  return { version: m[1], prerelease: m[2] !== undefined };
}

/**
 * Pure decision without git: validates the tag and the version match.
 * @param {string} tag
 * @param {string} pkgVersion
 * @returns {'next' | 'latest'}
 */
function decideDistTag(tag, pkgVersion) {
  const { version, prerelease } = parseTag(tag);
  if (pkgVersion !== version) {
    throw new Error(
      `package.json version ${JSON.stringify(pkgVersion)} does not match tag ${tag} (expected ${JSON.stringify(version)}). Bump the version and re-tag.`,
    );
  }
  return prerelease ? 'next' : 'latest';
}

/**
 * True when `commit` is an ancestor of (or equal to) `ref`.
 * Throws when git cannot answer (unknown ref, not a repository, shallow clone
 * missing history...), so a broken checkout never reads as "not on main" or,
 * worse, as "on main".
 */
function isAncestor(commit, ref, cwd) {
  const r = spawnSync('git', ['merge-base', '--is-ancestor', commit, ref], { cwd, encoding: 'utf8' });
  if (r.status === 0) return true;
  if (r.status === 1) return false;
  const detail = (r.error && r.error.message) || (r.stderr || '').trim() || `exit ${r.status}`;
  throw new Error(`Could not check whether ${commit} is on ${ref}: ${detail}`);
}

/**
 * Full guard: reads package.json from `cwd`, decides the dist-tag and, for a
 * `latest` publication, requires the commit to be on `mainRef`.
 */
function runGuard({ tag, commit = 'HEAD', mainRef = 'origin/main', cwd = process.cwd() }) {
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const distTag = decideDistTag(tag, pkg.version);
  if (distTag === 'latest' && !isAncestor(commit, mainRef, cwd)) {
    const mainName = mainRef.replace(/^origin\//, '');
    throw new Error(
      `Tag ${tag} would publish to "latest", but commit ${commit} is not on ${mainName} (${mainRef}). ` +
        `Only commits merged to ${mainName} may be published as latest; use a prerelease tag (e.g. ${tag}-rc.1) for anything else.`,
    );
  }
  return distTag;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const map = { '--tag': 'tag', '--main-ref': 'mainRef', '--commit': 'commit' };
    if (!(key in map)) throw new Error(`Unknown argument ${JSON.stringify(key)}.`);
    if (i + 1 >= argv.length) throw new Error(`${key} requires a value.`);
    out[map[key]] = argv[++i];
  }
  if (out.tag === undefined) throw new Error('--tag is required.');
  return out;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const distTag = runGuard(args);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `dist-tag=${distTag}\n`);
    }
    process.stdout.write(`${distTag}\n`);
  } catch (err) {
    process.stderr.write(`release-guard: ${err.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseTag, decideDistTag, isAncestor, runGuard };
