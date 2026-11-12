'use strict';

/**
 * api-guard.js - read-only guard and write gates for the API test client.
 *
 * Implements qa/00-standards/write-safety-policy.md. Pure: every function takes its
 * inputs as arguments (catalogs, env, base URL, parsed manifest) and never touches
 * the network or the file system, so the whole decision is testable with
 * `node --test` and fixtures/base.ts only has to call it before sending.
 *
 * READ  - decideRead(): the request must be in the read catalog, with the method
 *         that is catalogued, and must not be an endpoint the write catalog declares.
 * WRITE - decideWrite(): the four gates of the policy, in its order, then the
 *         environment check of its section 7:
 *           1 opt-in        QA_API_WRITE=1 in the environment of this run
 *           2 catalog       approved entry in the write catalog (who, when, scope,
 *                           revert; `forbidden` never passes)
 *           3 exclusions    hard exclusions in code, independent of the catalog,
 *                           framework list plus project additions (add-only)
 *           4 own record    the declared target record carries the test prefix
 *           environment     base URL host equals project.qaBaseUrl host, never prod
 *
 * Every rejection happens before anything is sent and its message starts with
 * `[api-guard] <gate>:` so the failing gate is visible in the test report.
 */

const { FRAMEWORK_EXCLUSIONS } = require('./hard-exclusions.js');

/** Environment variable that opens gate 1. Set only by `npm run test:write`. */
const WRITE_OPT_IN_VAR = 'QA_API_WRITE';

const READ_METHODS = Object.freeze(['GET', 'POST']);
const WRITE_METHODS = Object.freeze(['POST', 'PUT', 'PATCH', 'DELETE']);
const SCOPES = Object.freeze(['isolated', 'syncs', 'forbidden']);

const GATES = Object.freeze({
  READ: 'read-catalog',
  OPT_IN: 'gate 1 (opt-in)',
  CATALOG: 'gate 2 (approved catalog entry)',
  EXCLUSIONS: 'gate 3 (hard exclusions)',
  OWN_RECORD: 'gate 4 (own records only)',
  ENVIRONMENT: 'environment (policy section 7)',
});

// ---------------------------------------------------------------------------
// Hard exclusions (add-only)
// ---------------------------------------------------------------------------

/**
 * Compiles a pattern into a fresh, stateless, case-insensitive RegExp.
 * `g` and `y` are dropped: with them RegExp.test() advances lastIndex and the next
 * call can miss a path that matches, which would silently open gate 3.
 */
function compilePattern(source, flags) {
  const clean = String(flags || '').replace(/[gyi]/g, '');
  return new RegExp(source, `${clean}i`);
}

// Snapshot of the framework list taken when this module loads: sources and flags
// only. Later changes to the objects in hard-exclusions.js cannot reach it.
const FRAMEWORK_SNAPSHOT = Object.freeze(
  FRAMEWORK_EXCLUSIONS.map((category) =>
    Object.freeze({
      category: category.id,
      origin: 'framework',
      patterns: Object.freeze(category.patterns.map((p) => Object.freeze({ source: p.source, flags: p.flags }))),
    })
  )
);

const ALLOWED_PROJECT_KEYS = new Set(['category', 'pattern', 'reason']);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validates the project's additions. Each entry is `{ category, pattern, reason? }`
 * where `pattern` is a RegExp or a non-empty string (matched as a literal
 * substring). Anything else throws: an entry that cannot be read is not silently
 * skipped, and keys such as `remove`, `allow` or `except` do not exist, because
 * this list can only add.
 */
function normalizeProjectExclusions(projectExclusions) {
  if (projectExclusions === undefined || projectExclusions === null) return [];
  if (!Array.isArray(projectExclusions)) {
    throw new Error('[api-guard] project exclusions must be an array of { category, pattern } entries.');
  }
  return projectExclusions.map((entry, index) => {
    const where = `project exclusion #${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`[api-guard] ${where} must be an object { category, pattern }.`);
    }
    for (const key of Object.keys(entry)) {
      if (!ALLOWED_PROJECT_KEYS.has(key)) {
        throw new Error(
          `[api-guard] ${where} has unknown key "${key}". Project exclusions are add-only: ` +
          'they cannot remove, narrow or make exceptions to the framework list.'
        );
      }
    }
    if (typeof entry.category !== 'string' || !entry.category.trim()) {
      throw new Error(`[api-guard] ${where} needs a non-empty category.`);
    }
    let source;
    let flags = '';
    if (entry.pattern instanceof RegExp) {
      source = entry.pattern.source;
      flags = entry.pattern.flags;
      if (source === '(?:)') throw new Error(`[api-guard] ${where} has an empty pattern.`);
    } else if (typeof entry.pattern === 'string' && entry.pattern.trim()) {
      source = escapeRegExp(entry.pattern.trim());
    } else {
      throw new Error(`[api-guard] ${where} needs a pattern: a RegExp or a non-empty string.`);
    }
    compilePattern(source, flags); // throws on an invalid source
    return Object.freeze({
      category: entry.category.trim(),
      origin: 'project',
      patterns: Object.freeze([Object.freeze({ source, flags })]),
    });
  });
}

/**
 * The effective exclusion list: the framework snapshot, always first and always
 * complete, followed by the project's additions. This is the only way the guard
 * builds the list, so the result can never hold fewer framework patterns than
 * hard-exclusions.js ships.
 */
function effectiveExclusions(projectExclusions) {
  return Object.freeze([...FRAMEWORK_SNAPSHOT, ...normalizeProjectExclusions(projectExclusions)]);
}

/** `api/UploadFile/send_now` -> `api/upload/file/send/now`. */
function wordsForm(path) {
  return String(path)
    .replace(/([a-z0-9])([A-Z])/g, '$1/$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1/$2')
    .replace(/[_\-.\s]+/g, '/')
    .toLowerCase();
}

/**
 * First exclusion that matches any of `paths`, or null. Each path is tested raw and
 * in its words form.
 */
function matchExclusion(paths, projectExclusions) {
  const forms = [];
  for (const p of paths) {
    if (typeof p !== 'string' || !p) continue;
    forms.push(p, wordsForm(p));
  }
  for (const group of effectiveExclusions(projectExclusions)) {
    for (const { source, flags } of group.patterns) {
      const re = compilePattern(source, flags);
      const hit = forms.find((form) => re.test(form));
      if (hit !== undefined) {
        return { category: group.category, origin: group.origin, pattern: `/${source}/`, path: hit };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Catalog helpers
// ---------------------------------------------------------------------------

function normalizePath(p) {
  return String(p || '').trim().replace(/^\/+/, '');
}

function normalizeMethod(m) {
  return String(m || '').trim().toUpperCase();
}

/**
 * Fills `{name}` placeholders from `params`, URL-encoding each value. A missing or
 * unused parameter throws: a path that is not exactly the catalogued one is not
 * the endpoint that was approved.
 */
function resolvePath(template, params) {
  const given = params && typeof params === 'object' ? params : {};
  const used = new Set();
  const resolved = template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(given, name) || given[name] === undefined || given[name] === null || given[name] === '') {
      throw new Error(`missing path parameter "${name}" for ${template}`);
    }
    used.add(name);
    return encodeURIComponent(String(given[name]));
  });
  const unused = Object.keys(given).filter((k) => !used.has(k));
  if (unused.length) throw new Error(`unknown path parameter(s) ${unused.join(', ')} for ${template}`);
  return resolved;
}

/**
 * Finds the catalog entry for a request. `endpoint` is either a catalog id
 * (string) or `{ method, path }`, which must match an entry's method AND path
 * template exactly.
 */
function findEntry(endpoint, catalog) {
  const list = Array.isArray(catalog) ? catalog : [];
  if (typeof endpoint === 'string') {
    return list.find((e) => e && e.id === endpoint) || null;
  }
  if (endpoint && typeof endpoint === 'object') {
    const method = normalizeMethod(endpoint.method);
    const path = normalizePath(endpoint.path);
    return list.find((e) => e && normalizeMethod(e.method) === method && normalizePath(e.path) === path) || null;
  }
  return null;
}

function describeEndpoint(endpoint) {
  if (typeof endpoint === 'string') return `"${endpoint}"`;
  if (endpoint && typeof endpoint === 'object') return `${normalizeMethod(endpoint.method)} ${normalizePath(endpoint.path)}`;
  return String(endpoint);
}

function reject(gate, reason) {
  return { allowed: false, gate, message: `[api-guard] ${gate}: ${reason}` };
}

// ---------------------------------------------------------------------------
// Read guard
// ---------------------------------------------------------------------------

/**
 * @param {{ endpoint: string|{method:string,path:string}, params?: object }} request
 * @param {{ readCatalog: object[], writeCatalog?: object[] }} context
 */
function decideRead(request, context) {
  const { endpoint, params } = request || {};
  const entry = findEntry(endpoint, context && context.readCatalog);
  if (!entry) {
    return reject(
      GATES.READ,
      `${describeEndpoint(endpoint)} is not in the read catalog (fixtures/read-catalog.ts). ` +
      'Nothing was sent. Add it there only if it is a query with no side effect; a different ' +
      'method on a catalogued path is a different endpoint.'
    );
  }
  const method = normalizeMethod(entry.method);
  const templatePath = normalizePath(entry.path);
  if (!READ_METHODS.includes(method)) {
    return reject(GATES.READ, `read catalog entry "${entry.id}" uses ${method}; reads use ${READ_METHODS.join(' or ')}.`);
  }
  const declaredWrite = findEntry({ method, path: templatePath }, context && context.writeCatalog);
  if (declaredWrite) {
    return reject(
      GATES.READ,
      `${method} ${templatePath} is declared as a write ("${declaredWrite.id}" in fixtures/write-catalog.ts). ` +
      'A write never goes through the read client; use write() and its gates.'
    );
  }
  let path;
  try {
    path = resolvePath(templatePath, params);
  } catch (err) {
    return reject(GATES.READ, `${err.message}. Nothing was sent.`);
  }
  return { allowed: true, entry, method, templatePath, path };
}

// ---------------------------------------------------------------------------
// Write gates
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isFilled(value) {
  return typeof value === 'string' && value.trim() !== '' && !/^<.*>$/.test(value.trim());
}

/** Problems that keep a write catalog entry from passing gate 2, or [] when it can. */
function approvalProblems(entry) {
  const problems = [];
  if (!SCOPES.includes(entry.scope)) {
    problems.push(`scope must be one of ${SCOPES.join(', ')} (got ${JSON.stringify(entry.scope)})`);
    return problems;
  }
  if (entry.scope === 'forbidden') {
    problems.push('scope is "forbidden": it never runs from automation');
    return problems;
  }
  const approval = entry.approval || {};
  if (!isFilled(approval.by)) problems.push('approval.by (who approved it) is missing');
  if (!isFilled(approval.date) || !ISO_DATE.test(approval.date.trim()) || Number.isNaN(Date.parse(approval.date.trim()))) {
    problems.push('approval.date (when, YYYY-MM-DD) is missing or invalid');
  }
  if (!isFilled(approval.revert)) problems.push('approval.revert (how its effect is reverted) is missing');
  if (entry.scope === 'syncs' && !isFilled(approval.downstream)) {
    problems.push('scope "syncs" needs approval.downstream: every system it can reach and why it is not production');
  }
  if (!WRITE_METHODS.includes(normalizeMethod(entry.method))) {
    problems.push(`method must be one of ${WRITE_METHODS.join(', ')}`);
  }
  return problems;
}

function hostOf(url) {
  try {
    const parsed = new URL(String(url).trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Policy section 7: writes run only against the QA environment declared in the
 * manifest, and never against a host that looks like production.
 */
function environmentProblem(baseUrl, manifest) {
  const target = hostOf(baseUrl);
  if (!target) return `QA_BASE_URL is not an http(s) URL (${JSON.stringify(baseUrl === undefined ? null : baseUrl)}).`;
  if (/prod/i.test(target)) return `target host ${target} looks like production; writes never run there.`;
  const declared = manifest && manifest.project ? manifest.project.qaBaseUrl : undefined;
  const declaredHost = hostOf(declared);
  if (!declaredHost) {
    return 'qa/qa-framework.config.json has no http(s) project.qaBaseUrl; writes run only against the declared QA environment.';
  }
  if (declaredHost !== target) {
    return `target host ${target} is not the declared QA host ${declaredHost} (project.qaBaseUrl).`;
  }
  return null;
}

/**
 * @param {{ endpoint: string|{method:string,path:string}, params?: object, testRecord?: string }} request
 * @param {{ env?: object, writeCatalog: object[], projectExclusions?: object[], recordPrefix: string,
 *           baseUrl?: string, manifest?: object }} context
 */
function decideWrite(request, context) {
  const { endpoint, params, testRecord } = request || {};
  const ctx = context || {};
  const env = ctx.env || {};

  // Gate 1 - opt-in. Exactly "1": a stray "true", "yes" or "0" stays closed.
  if (env[WRITE_OPT_IN_VAR] !== '1') {
    return reject(
      GATES.OPT_IN,
      `writes are disabled. Write tests run only with \`npm run test:write\`, which sets ${WRITE_OPT_IN_VAR}=1 ` +
      'for that run. Nothing was sent.'
    );
  }

  // Gate 2 - approved catalog entry.
  const entry = findEntry(endpoint, ctx.writeCatalog);
  if (!entry) {
    return reject(GATES.CATALOG, `${describeEndpoint(endpoint)} is not in the write catalog (fixtures/write-catalog.ts). Nothing was sent.`);
  }
  const problems = approvalProblems(entry);
  if (problems.length) {
    return reject(GATES.CATALOG, `"${entry.id}" cannot be written: ${problems.join('; ')}. Nothing was sent.`);
  }
  const method = normalizeMethod(entry.method);
  const templatePath = normalizePath(entry.path);
  let path;
  try {
    path = resolvePath(templatePath, params);
  } catch (err) {
    return reject(GATES.CATALOG, `${err.message}. Nothing was sent.`);
  }

  // Gate 3 - hard exclusions, on the template and on the resolved path.
  let hit;
  try {
    hit = matchExclusion([templatePath, path], ctx.projectExclusions);
  } catch (err) {
    return reject(GATES.EXCLUSIONS, `${err.message.replace(/^\[api-guard\] /, '')} Nothing was sent.`);
  }
  if (hit) {
    return reject(
      GATES.EXCLUSIONS,
      `"${entry.id}" (${method} ${path}) matches the ${hit.origin} exclusion "${hit.category}" ${hit.pattern}. ` +
      'No catalog entry can allow it. Nothing was sent.'
    );
  }

  // Gate 4 - own records only. The test declares the exact name of the record it
  // targets; it must carry the project's test prefix and be more than the prefix.
  const prefix = typeof ctx.recordPrefix === 'string' ? ctx.recordPrefix : '';
  if (!prefix.trim()) {
    return reject(GATES.OWN_RECORD, 'no test record prefix is configured (TEST_RECORD_PREFIX in fixtures/write-catalog.ts). Nothing was sent.');
  }
  if (typeof testRecord !== 'string' || !testRecord.startsWith(prefix) || testRecord.length <= prefix.length) {
    return reject(
      GATES.OWN_RECORD,
      `the target record must be one this test created, named with the prefix "${prefix}" ` +
      `(got ${JSON.stringify(testRecord === undefined ? null : testRecord)}). Nothing was sent.`
    );
  }

  // Environment - policy section 7.
  const envProblem = environmentProblem(ctx.baseUrl, ctx.manifest);
  if (envProblem) return reject(GATES.ENVIRONMENT, `${envProblem} Nothing was sent.`);

  return { allowed: true, entry, method, templatePath, path };
}

function assertAllowed(decision) {
  if (!decision.allowed) {
    const err = new Error(decision.message);
    err.gate = decision.gate;
    throw err;
  }
  return decision;
}

const assertRead = (request, context) => assertAllowed(decideRead(request, context));
const assertWrite = (request, context) => assertAllowed(decideWrite(request, context));

// ---------------------------------------------------------------------------
// Gate 4 helper for tests
// ---------------------------------------------------------------------------

/**
 * Returns the single row whose name equals `exactName`, null when there is none,
 * and throws when there is more than one: an ambiguous lookup fails the test, it
 * never picks one. `exactName` must carry the test prefix.
 */
function pickOwnRecord(rows, nameOf, exactName, prefix) {
  if (typeof prefix !== 'string' || !prefix.trim()) throw new Error('[api-guard] pickOwnRecord needs the test record prefix.');
  if (typeof exactName !== 'string' || !exactName.startsWith(prefix) || exactName.length <= prefix.length) {
    throw new Error(`[api-guard] ${GATES.OWN_RECORD}: "${exactName}" does not carry the test prefix "${prefix}".`);
  }
  const matches = (Array.isArray(rows) ? rows : []).filter((row) => nameOf(row) === exactName);
  if (matches.length > 1) {
    throw new Error(`[api-guard] ${GATES.OWN_RECORD}: ${matches.length} records are named "${exactName}"; the lookup must return exactly one. Nothing was picked.`);
  }
  return matches.length === 1 ? matches[0] : null;
}

// ---------------------------------------------------------------------------
// Catalog validation (run offline by tests/security/catalogs.spec.ts)
// ---------------------------------------------------------------------------

/**
 * Structural problems in the project's catalogs, as a list of strings ([] = ok).
 * Pending approvals are reported too: an entry without a complete approval would
 * be rejected at gate 2 anyway, and keeping it in the catalog hides that.
 */
function validateCatalogs({ readCatalog, writeCatalog, projectExclusions, recordPrefix }) {
  const problems = [];
  const reads = Array.isArray(readCatalog) ? readCatalog : [];
  const writes = Array.isArray(writeCatalog) ? writeCatalog : [];
  if (!Array.isArray(readCatalog)) problems.push('read catalog is not an array');
  if (!Array.isArray(writeCatalog)) problems.push('write catalog is not an array');

  // An unreadable project list is reported, and the framework list is still
  // checked against the write catalog without it.
  let usableExclusions = projectExclusions;
  try {
    normalizeProjectExclusions(projectExclusions);
  } catch (err) {
    problems.push(err.message.replace(/^\[api-guard\] /, ''));
    usableExclusions = [];
  }
  if (typeof recordPrefix !== 'string' || !recordPrefix.trim()) problems.push('TEST_RECORD_PREFIX is empty');

  const ids = new Set();
  const checkId = (e, label) => {
    if (!e || typeof e.id !== 'string' || !e.id.trim()) {
      problems.push(`${label} entry without id`);
      return false;
    }
    if (ids.has(e.id)) problems.push(`duplicate id "${e.id}"`);
    ids.add(e.id);
    if (!normalizePath(e.path)) problems.push(`"${e.id}" has no path`);
    return true;
  };

  for (const e of reads) {
    if (!checkId(e, 'read catalog')) continue;
    if (!READ_METHODS.includes(normalizeMethod(e.method))) problems.push(`read "${e.id}": method must be ${READ_METHODS.join(' or ')}`);
    if (e.auth !== undefined && e.auth !== 'required' && e.auth !== 'none') problems.push(`read "${e.id}": auth must be "required" or "none"`);
  }
  for (const e of writes) {
    if (!checkId(e, 'write catalog')) continue;
    if (e.scope === 'forbidden') {
      // Recorded so the decision stays visible; it needs no approval.
      if (!WRITE_METHODS.includes(normalizeMethod(e.method))) problems.push(`write "${e.id}": method must be one of ${WRITE_METHODS.join(', ')}`);
      continue;
    }
    for (const p of approvalProblems(e)) problems.push(`write "${e.id}": ${p}`);
    const hit = matchExclusion([normalizePath(e.path)], usableExclusions);
    if (hit) {
      problems.push(`write "${e.id}" matches the ${hit.origin} exclusion "${hit.category}" ${hit.pattern}: gate 3 will always block it; mark it "forbidden" or remove it`);
    }
    if (reads.some((r) => r && normalizeMethod(r.method) === normalizeMethod(e.method) && normalizePath(r.path) === normalizePath(e.path))) {
      problems.push(`write "${e.id}" is also in the read catalog`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Response contract helpers
// ---------------------------------------------------------------------------

/**
 * True for `application/json` and any `+json` media type. Gateways in front of a
 * single-page app often answer an unknown route with HTTP 200 and the app's HTML,
 * so "status 200" alone proves nothing: an API response must be JSON.
 */
function isJsonContentType(contentType) {
  const media = String(contentType || '').split(';')[0].trim().toLowerCase();
  return media === 'application/json' || /^application\/[a-z0-9.!#$&^_-]+\+json$/.test(media);
}

/** `https://host/app/` + `api/x` -> `https://host/app/api/x` (keeps the base path). */
function joinUrl(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}/${normalizePath(path)}`;
}

module.exports = {
  WRITE_OPT_IN_VAR,
  READ_METHODS,
  WRITE_METHODS,
  SCOPES,
  GATES,
  effectiveExclusions,
  matchExclusion,
  wordsForm,
  resolvePath,
  decideRead,
  decideWrite,
  assertRead,
  assertWrite,
  pickOwnRecord,
  validateCatalogs,
  isJsonContentType,
  joinUrl,
};
