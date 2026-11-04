'use strict';

/**
 * scripts/lib/module-keys.js - the one place that knows how a module or submodule
 * key maps to a folder name.
 *
 * Two layouts coexist on purpose, and they are NOT the same string:
 *
 *   specs       qa/01-specifications/module-{name}/submodule-{name}/
 *   automation  qa/07-automation/e2e/tests/{name}/{name}.spec.ts
 *
 * The prefixed form is what every skill under skills/, docs/folder-structure-guide.md
 * and the "specPath" field of qa-framework.config.json declare. The bare form is what
 * "automationPath" declares and what the live consuming projects actually contain.
 * init.js used to write the bare form in both places, so a freshly scaffolded project
 * violated the spec-path convention its own agent instructions impose.
 *
 * Both helpers are idempotent: a config that already spells the key as
 * "module-suppliers" must not become "module-module-suppliers", and a key written
 * bare must not lose a leading segment that merely looks like a prefix.
 */

/** Prefix `key` with `prefix-` unless it already carries it. */
function withPrefix(prefix, key) {
  const marker = `${prefix}-`;
  return key.startsWith(marker) ? key : marker + key;
}

/** Strip a leading `prefix-` from `key` if present. */
function withoutPrefix(prefix, key) {
  const marker = `${prefix}-`;
  return key.startsWith(marker) ? key.slice(marker.length) : key;
}

/** Folder name for a module's spec tree: module-{name}. */
const moduleSpecDirName = key => withPrefix('module', key);

/** Folder name for a submodule's spec tree: submodule-{name}. */
const submoduleSpecDirName = key => withPrefix('submodule', key);

/** Bare module name used by automation paths and TC ids. */
const moduleBareName = key => withoutPrefix('module', key);

/** Bare submodule name used by automation paths and TC ids. */
const submoduleBareName = key => withoutPrefix('submodule', key);

module.exports = {
  withPrefix,
  withoutPrefix,
  moduleSpecDirName,
  submoduleSpecDirName,
  moduleBareName,
  submoduleBareName,
};
