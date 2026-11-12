'use strict';

// Tests for .github/scripts/release-guard.js, the decision logic behind
// .github/workflows/publish.yml. The ancestry check runs against throwaway git
// repositories created here, never against this repository's own history.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');

const GUARD_PATH = path.join(__dirname, '..', '.github', 'scripts', 'release-guard.js');
const { parseTag, decideDistTag, isAncestor, runGuard } = require(GUARD_PATH);

// ---------------------------------------------------------------------------
// Pure decision: tag + version -> dist-tag
// ---------------------------------------------------------------------------

test('rc tag with matching version -> next', () => {
  assert.equal(decideDistTag('v1.14.0-rc.1', '1.14.0-rc.1'), 'next');
});

test('any prerelease suffix -> next', () => {
  assert.equal(decideDistTag('v2.0.0-beta.3', '2.0.0-beta.3'), 'next');
  assert.equal(decideDistTag('v1.0.0-alpha', '1.0.0-alpha'), 'next');
});

test('final tag with matching version -> latest', () => {
  assert.equal(decideDistTag('v1.14.0', '1.14.0'), 'latest');
});

test('version different from the tag -> error', () => {
  assert.throws(() => decideDistTag('v1.14.0', '1.13.2'), /does not match/);
  assert.throws(() => decideDistTag('v1.14.0-rc.1', '1.14.0'), /does not match/);
  assert.throws(() => decideDistTag('v1.14.0', '1.14.0-rc.1'), /does not match/);
  assert.throws(() => decideDistTag('v1.14.0-rc.1', '1.14.0-rc.2'), /does not match/);
});

test('malformed tags -> error', () => {
  const bad = [
    '',
    '1.14.0', // missing v
    'v1.14', // missing patch
    'v1.14.0.1',
    'v01.14.0', // leading zero
    'v1.14.0-', // empty prerelease
    'v1.14.0-rc..1', // empty identifier
    'v1.14.0-rc.01', // numeric identifier with leading zero
    'v1.14.0+build.1', // build metadata is dropped by npm, so it can never match
    'v1.14.0-rc.1 ', // trailing whitespace
    'vX.Y.Z',
    'refs/tags/v1.14.0',
  ];
  for (const tag of bad) {
    assert.throws(() => parseTag(tag), /Malformed release tag/, `expected ${JSON.stringify(tag)} to be rejected`);
  }
});

test('non-string tag -> error', () => {
  assert.throws(() => parseTag(undefined), /Malformed release tag/);
});

// ---------------------------------------------------------------------------
// Ancestry check against a temporary git repository
// ---------------------------------------------------------------------------

function git(cwd, ...args) {
  return execFileSync(
    'git',
    ['-c', 'user.name=release-guard-test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

// Builds:  A -- B   (main)
//               \
//                C  (dev)
// and returns the repo path plus the commit SHAs.
function makeRepo(version) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-guard-'));
  git(dir, 'init', '-q', '-b', 'main');
  const writePkg = (v) =>
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', version: v }) + '\n');
  writePkg(version);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'A');
  const a = git(dir, 'rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'b.txt'), 'b\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'B');
  const b = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'checkout', '-q', '-b', 'dev');
  fs.writeFileSync(path.join(dir, 'c.txt'), 'c\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'C');
  const c = git(dir, 'rev-parse', 'HEAD');
  return { dir, a, b, c, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('isAncestor: commits on main are ancestors, a dev-only commit is not', (t) => {
  const repo = makeRepo('1.14.0');
  t.after(repo.cleanup);
  assert.equal(isAncestor(repo.a, 'main', repo.dir), true);
  assert.equal(isAncestor(repo.b, 'main', repo.dir), true);
  assert.equal(isAncestor(repo.c, 'main', repo.dir), false);
});

test('isAncestor: unknown main ref -> error, not a silent false', (t) => {
  const repo = makeRepo('1.14.0');
  t.after(repo.cleanup);
  assert.throws(() => isAncestor(repo.a, 'origin/main', repo.dir), /Could not check/);
});

test('runGuard: final tag from a commit on main -> latest', (t) => {
  const repo = makeRepo('1.14.0');
  t.after(repo.cleanup);
  assert.equal(runGuard({ tag: 'v1.14.0', commit: repo.b, mainRef: 'main', cwd: repo.dir }), 'latest');
});

test('runGuard: final tag from a commit outside main -> error', (t) => {
  const repo = makeRepo('1.14.0');
  t.after(repo.cleanup);
  assert.throws(
    () => runGuard({ tag: 'v1.14.0', commit: repo.c, mainRef: 'main', cwd: repo.dir }),
    /not on main/,
  );
});

test('runGuard: rc tag from a commit outside main -> next (no ancestry requirement)', (t) => {
  const repo = makeRepo('1.14.0-rc.1');
  t.after(repo.cleanup);
  assert.equal(runGuard({ tag: 'v1.14.0-rc.1', commit: repo.c, mainRef: 'main', cwd: repo.dir }), 'next');
});

test('runGuard: version mismatch is reported before any git call', (t) => {
  const repo = makeRepo('1.13.2');
  t.after(repo.cleanup);
  // mainRef does not exist: if git ran first, the error would be "Could not check".
  assert.throws(
    () => runGuard({ tag: 'v1.14.0', commit: repo.b, mainRef: 'no-such-ref', cwd: repo.dir }),
    /does not match/,
  );
});

// ---------------------------------------------------------------------------
// CLI contract used by publish.yml
// ---------------------------------------------------------------------------

function runCli(args, cwd, env = {}) {
  const childEnv = { ...process.env, ...env };
  delete childEnv.GITHUB_OUTPUT;
  if (env.GITHUB_OUTPUT) childEnv.GITHUB_OUTPUT = env.GITHUB_OUTPUT;
  return spawnSync(process.execPath, [GUARD_PATH, ...args], { cwd, encoding: 'utf8', env: childEnv });
}

test('CLI: prints the dist-tag and writes it to GITHUB_OUTPUT', (t) => {
  const repo = makeRepo('1.14.0');
  t.after(repo.cleanup);
  const out = path.join(repo.dir, 'gh-output.txt');
  fs.writeFileSync(out, '');
  const r = runCli(['--tag', 'v1.14.0', '--main-ref', 'main', '--commit', repo.b], repo.dir, { GITHUB_OUTPUT: out });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'latest');
  assert.equal(fs.readFileSync(out, 'utf8'), 'dist-tag=latest\n');
});

test('CLI: defaults the commit to HEAD', (t) => {
  const repo = makeRepo('1.14.0');
  t.after(repo.cleanup);
  // HEAD is on dev (commit C), which is not on main.
  const r = runCli(['--tag', 'v1.14.0', '--main-ref', 'main'], repo.dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not on main/);
});

test('CLI: failure exits 1 with a message and writes no output', (t) => {
  const repo = makeRepo('1.13.2');
  t.after(repo.cleanup);
  const out = path.join(repo.dir, 'gh-output.txt');
  fs.writeFileSync(out, '');
  const r = runCli(['--tag', 'v1.14.0', '--main-ref', 'main'], repo.dir, { GITHUB_OUTPUT: out });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /release-guard: .*does not match/);
  assert.equal(r.stdout, '');
  assert.equal(fs.readFileSync(out, 'utf8'), '');
});

test('CLI: missing --tag -> usage error', (t) => {
  const repo = makeRepo('1.14.0');
  t.after(repo.cleanup);
  const r = runCli([], repo.dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /--tag is required/);
});
