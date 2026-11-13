'use strict';

// CLI output must be plain ASCII. Windows PowerShell 5.1 re-encodes redirected output
// with the console codepage, so an emoji such as a check mark or a warning sign lands
// in the file as mojibake. Markers like [ok] and [!] survive every codepage.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');
const NON_ASCII = /[^\x00-\x7F]/;

function run(script, args, cwd) {
  const result = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, script), ...args], {
    cwd,
    env: { ...process.env, INIT_CWD: cwd },
    encoding: 'utf8',
  });
  // The temp path is environment data, not program output.
  const strip = (text) => text.split(cwd).join('<root>');
  return { status: result.status, out: strip(result.stdout) + strip(result.stderr) };
}

function assertAscii(label, out) {
  const line = out.split(/\r?\n/).find((l) => NON_ASCII.test(l));
  assert.equal(line, undefined, `${label} printed a non-ASCII line: ${JSON.stringify(line)}`);
}

test('ascii: init, upgrade and validate print only ASCII, warnings included', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-ascii-'));
  try {
    fs.writeFileSync(path.join(root, 'qa-framework.config.json'), JSON.stringify({
      project: { name: 'demo' },
      integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
    }));
    const init = run('init.js', [], root);
    assertAscii('init', init.out);

    // A marker-less agent forces an "Updated" list and a warning in the Results section.
    fs.writeFileSync(path.join(root, '.claude', 'agents', 'qa-plan.md'), '---\nname: qa-plan\n---\nlegacy\n');
    const upgrade = run('upgrade.js', [], root);
    assert.equal(upgrade.status, 0, upgrade.out);
    assert.match(upgrade.out, /Warnings:/);
    assertAscii('upgrade', upgrade.out);

    const passed = run('validate.js', [], root);
    assertAscii('validate', passed.out);

    fs.rmSync(path.join(root, 'qa', '06-defects'), { recursive: true, force: true });
    const failed = run('validate.js', [], root);
    assert.equal(failed.status, 1, failed.out);
    assertAscii('validate (errors)', failed.out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('ascii: no console call in scripts/ carries a non-ASCII character', () => {
  const offenders = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        fs.readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, i) => {
          if (/console\.(log|warn|error|info)/.test(line) && NON_ASCII.test(line)) {
            offenders.push(`${path.relative(SCRIPTS_DIR, full)}:${i + 1}`);
          }
        });
      }
    }
  })(SCRIPTS_DIR);
  assert.deepEqual(offenders, []);
});
