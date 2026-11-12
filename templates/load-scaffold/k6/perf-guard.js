'use strict';

/**
 * perf-guard.js - plan validation and safety rules for k6 performance runs.
 *
 * Implements qa/00-standards/write-safety-policy.md for load and performance tests:
 *   - section 7 (environment): the plan's baseUrl host must be the host of
 *     project.qaBaseUrl in qa/qa-framework.config.json, and never anything that
 *     looks like production;
 *   - section 6 (writes under load): a write endpoint runs as one real call
 *     (1 VU, 1 iteration) unless the plan carries an explicit, capped concurrent
 *     write authorization; a plan with any write needs the explicit write opt-in
 *     of the run (gate 1 of section 2), and any load run states its go-ahead and
 *     the account or lane it uses.
 *
 * Every function here is pure: inputs come in as arguments (the parsed plan, the
 * parsed manifest, today's date, the run options) and nothing touches the network,
 * the file system or the process. run-perf.js does the I/O and calls these before
 * k6 is ever started. Each refusal names the rule and the policy section.
 *
 * Credentials are never part of the plan: the plan names WHERE a session value
 * comes from (an environment variable or a gitignored file), never the value.
 */

const POLICY = 'qa/00-standards/write-safety-policy.md';

const TEST_TYPES = Object.freeze(['load', 'stress', 'spike', 'soak', 'concurrency', 'smoke']);
const READ_METHODS = Object.freeze(['GET', 'HEAD']);
const WRITE_METHODS = Object.freeze(['POST', 'PUT', 'PATCH', 'DELETE']);
const AUTH_SCHEMES = Object.freeze(['none', 'cookie', 'bearer', 'header']);

// Keys that hold a credential. Any of them anywhere in a plan refuses the plan: a
// value there would be committed with the plan and copied into the evidence folder.
const CREDENTIAL_KEYS = /^(cookie|cookies|authorization|password|passwd|pwd|secret|client_?secret|api_?key|access_?token|refresh_?token|bearer|session_?cookie)$/i;

// Tags become k6 metric and scenario names and report row labels.
const TAG_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DURATION_PATTERN = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+)s)?$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveInt(value) {
  return Number.isInteger(value) && value >= 1;
}

/** "1h2m30s", "90s", "2m" -> seconds; null when the text is not a k6 duration we accept. */
function parseDuration(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const match = text.match(DURATION_PATTERN);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  return (Number(match[1] || 0) * 3600) + (Number(match[2] || 0) * 60) + Number(match[3] || 0);
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

function today(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// --- Plan structure ----------------------------------------------------------------

/**
 * The load an endpoint runs under, normalized to one of three k6 executors.
 *   { vus, iterations }  -> shared-iterations (bounded number of calls)
 *   { vus, duration }    -> constant-vus      (open number of calls)
 *   { stages: [...] }    -> ramping-vus       (open number of calls)
 * Returns { shape, maxVus, iterations|null, durationSeconds|null } or { error }.
 */
function describeLoad(load) {
  if (!isObject(load)) return { error: 'load must be an object' };
  const hasStages = load.stages !== undefined;
  const hasIterations = load.iterations !== undefined;
  const hasDuration = load.duration !== undefined;
  const shapes = [hasStages, hasIterations, hasDuration].filter(Boolean).length;
  if (shapes !== 1) {
    return { error: 'load must have exactly one of: stages, iterations (with vus), duration (with vus)' };
  }
  if (hasStages) {
    if (!Array.isArray(load.stages) || load.stages.length === 0) return { error: 'load.stages must be a non-empty array' };
    if (load.vus !== undefined) return { error: 'load.vus is not used with stages; set each stage target instead' };
    let seconds = 0;
    let maxVus = 0;
    for (const [i, stage] of load.stages.entries()) {
      const s = isObject(stage) ? parseDuration(stage.duration) : null;
      if (s === null) return { error: `load.stages[${i}].duration must be a duration like "30s", "2m" or "1h"` };
      if (!Number.isInteger(stage.target) || stage.target < 0) return { error: `load.stages[${i}].target must be an integer >= 0` };
      seconds += s;
      maxVus = Math.max(maxVus, stage.target);
    }
    if (maxVus < 1) return { error: 'load.stages never reaches 1 VU' };
    return { shape: 'stages', maxVus, iterations: null, durationSeconds: seconds };
  }
  if (!positiveInt(load.vus)) return { error: 'load.vus must be an integer >= 1' };
  if (hasIterations) {
    if (!positiveInt(load.iterations)) return { error: 'load.iterations must be an integer >= 1' };
    if (load.iterations < load.vus) return { error: 'load.iterations must be >= load.vus (shared-iterations gives each VU at least one call)' };
    return { shape: 'iterations', maxVus: load.vus, iterations: load.iterations, durationSeconds: null };
  }
  const seconds = parseDuration(load.duration);
  if (seconds === null) return { error: 'load.duration must be a duration like "30s", "2m" or "1h"' };
  return { shape: 'duration', maxVus: load.vus, iterations: null, durationSeconds: seconds };
}

/** Method plus declaration -> 'read' | 'write'. */
function effectOf(endpoint) {
  const method = String(endpoint.method || '').toUpperCase();
  if (READ_METHODS.includes(method)) return 'read';
  if (method === 'POST' && endpoint.query !== undefined) return 'read';
  return 'write';
}

function findCredentialKeys(value, trail, found) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => findCredentialKeys(item, `${trail}[${i}]`, found));
  } else if (isObject(value)) {
    for (const [key, inner] of Object.entries(value)) {
      const here = trail ? `${trail}.${key}` : key;
      if (CREDENTIAL_KEYS.test(key)) found.push(here);
      findCredentialKeys(inner, here, found);
    }
  }
  return found;
}

function validateCriteria(criteria, tags, problems) {
  if (!isObject(criteria)) {
    problems.push('exitCriteria is required: declare the exit criteria before the run, not after looking at the result (at least exitCriteria.p95Ms)');
    return;
  }
  const checkBudget = (obj, where) => {
    if (obj.p95Ms !== undefined && !(typeof obj.p95Ms === 'number' && obj.p95Ms > 0)) problems.push(`${where}.p95Ms must be a number > 0`);
    if (obj.p99Ms !== undefined && !(typeof obj.p99Ms === 'number' && obj.p99Ms > 0)) problems.push(`${where}.p99Ms must be a number > 0`);
    if (obj.minThroughputRps !== undefined && !(typeof obj.minThroughputRps === 'number' && obj.minThroughputRps > 0)) {
      problems.push(`${where}.minThroughputRps must be a number > 0`);
    }
  };
  if (!(typeof criteria.p95Ms === 'number' && criteria.p95Ms > 0)) problems.push('exitCriteria.p95Ms is required and must be a number > 0');
  checkBudget(criteria, 'exitCriteria');
  if (!nonEmptyString(criteria.source)) {
    problems.push('exitCriteria.source is required: who agreed these criteria, or the stated assumption they rest on');
  }
  if (criteria.perEndpoint !== undefined) {
    if (!isObject(criteria.perEndpoint)) problems.push('exitCriteria.perEndpoint must be an object keyed by endpoint tag');
    else {
      for (const [tag, budget] of Object.entries(criteria.perEndpoint)) {
        if (!tags.includes(tag)) problems.push(`exitCriteria.perEndpoint.${tag} names no endpoint of this plan`);
        else if (!isObject(budget)) problems.push(`exitCriteria.perEndpoint.${tag} must be an object`);
        else checkBudget(budget, `exitCriteria.perEndpoint.${tag}`);
      }
    }
  }
}

function validateComparison(comparison, tags, problems) {
  if (comparison === undefined) return;
  if (!isObject(comparison) || !Array.isArray(comparison.pairs) || comparison.pairs.length === 0) {
    problems.push('comparison must be an object with a non-empty pairs array');
    return;
  }
  comparison.pairs.forEach((pair, i) => {
    const where = `comparison.pairs[${i}]`;
    if (!isObject(pair)) { problems.push(`${where} must be an object`); return; }
    if (!tags.includes(pair.candidate)) problems.push(`${where}.candidate must be the tag of an endpoint of this plan`);
    if (pair.baselineSummary === undefined && !tags.includes(pair.baseline)) {
      problems.push(`${where}.baseline must be the tag of an endpoint of this plan, or set baselineSummary to an earlier saved k6 summary`);
    }
    if (!nonEmptyString(pair.baseline)) problems.push(`${where}.baseline is required (the tag of the baseline endpoint)`);
    if (pair.baselineSummary !== undefined && !nonEmptyString(pair.baselineSummary)) problems.push(`${where}.baselineSummary must be a file path`);
    if (pair.maxRegressionPct === undefined && pair.minSpeedup === undefined) {
      problems.push(`${where} needs maxRegressionPct or minSpeedup: the comparison criterion is declared before the run too`);
    }
    if (pair.maxRegressionPct !== undefined && !(typeof pair.maxRegressionPct === 'number' && pair.maxRegressionPct >= 0)) {
      problems.push(`${where}.maxRegressionPct must be a number >= 0`);
    }
    if (pair.minSpeedup !== undefined && !(typeof pair.minSpeedup === 'number' && pair.minSpeedup > 0)) {
      problems.push(`${where}.minSpeedup must be a number > 0`);
    }
  });
}

function validateAuth(auth, problems) {
  if (!isObject(auth)) {
    problems.push(`auth is required: { "scheme": one of ${AUTH_SCHEMES.join(', ')}, "sessions": [...] } ("none" for a public API)`);
    return;
  }
  if (!AUTH_SCHEMES.includes(auth.scheme)) problems.push(`auth.scheme must be one of ${AUTH_SCHEMES.join(', ')}`);
  if (auth.scheme === 'header' && !nonEmptyString(auth.headerName)) problems.push('auth.headerName is required with scheme "header"');
  if (auth.scheme === 'none') {
    if (auth.sessions !== undefined) problems.push('auth.sessions must be absent with scheme "none"');
    return;
  }
  if (!Array.isArray(auth.sessions) || auth.sessions.length === 0) {
    problems.push('auth.sessions must list at least one session source: { "env": "VAR_NAME" } or { "file": "path" }');
    return;
  }
  auth.sessions.forEach((source, i) => {
    const where = `auth.sessions[${i}]`;
    if (!isObject(source)) { problems.push(`${where} must be an object`); return; }
    const kinds = ['env', 'file'].filter((k) => source[k] !== undefined);
    if (kinds.length !== 1 || Object.keys(source).length !== 1) {
      problems.push(`${where} must have exactly one key: "env" (an environment variable name) or "file" (a gitignored file path)`);
      return;
    }
    if (source.env !== undefined && !(typeof source.env === 'string' && ENV_NAME_PATTERN.test(source.env))) {
      problems.push(`${where}.env must be an environment variable NAME in upper case (the value is never written in the plan)`);
    }
    if (source.file !== undefined && !nonEmptyString(source.file)) problems.push(`${where}.file must be a file path`);
  });
}

/**
 * Structural validation. Returns a list of problems; empty means the plan is
 * well-formed. Safety rules are checked separately by safetyProblems().
 */
function validatePlan(plan) {
  const problems = [];
  if (!isObject(plan)) return ['the plan must be a JSON object'];

  if (!(typeof plan.topic === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(plan.topic))) {
    problems.push('topic is required: a short lower-case slug (letters, digits, hyphens), used to name the evidence folder');
  }
  if (!TEST_TYPES.includes(plan.testType)) {
    problems.push(`testType is required and must be one of ${TEST_TYPES.join(', ')}: name the test type before running`);
  }
  if (!nonEmptyString(plan.baseUrl) || !hostOf(plan.baseUrl)) problems.push('baseUrl is required and must be an http(s) URL');
  if (!isObject(plan.goAhead) || !nonEmptyString(plan.goAhead.by) || !nonEmptyString(plan.goAhead.account)) {
    problems.push('goAhead is required: { "by": who gave the go-ahead for this run, "account": the account or lane it uses } (policy section 6)');
  }
  validateAuth(plan.auth, problems);

  let defaultLoad = null;
  if (plan.load !== undefined) {
    defaultLoad = describeLoad(plan.load);
    if (defaultLoad.error) problems.push(`plan ${defaultLoad.error}`);
  }

  const tags = [];
  if (!Array.isArray(plan.endpoints) || plan.endpoints.length === 0) {
    problems.push('endpoints must be a non-empty array');
  } else {
    plan.endpoints.forEach((ep, i) => {
      const where = `endpoints[${i}]`;
      if (!isObject(ep)) { problems.push(`${where} must be an object`); return; }
      if (!(typeof ep.tag === 'string' && TAG_PATTERN.test(ep.tag))) {
        problems.push(`${where}.tag must start with a letter and use only letters, digits and underscores (max 48)`);
      } else if (tags.includes(ep.tag)) {
        problems.push(`${where}.tag "${ep.tag}" is used twice`);
      } else {
        tags.push(ep.tag);
      }
      const method = String(ep.method || '').toUpperCase();
      if (![...READ_METHODS, ...WRITE_METHODS].includes(method)) {
        problems.push(`${where}.method must be one of ${[...READ_METHODS, ...WRITE_METHODS].join(', ')}`);
      }
      if (!nonEmptyString(ep.path)) problems.push(`${where}.path is required (relative to baseUrl)`);
      else if (/^[a-z][a-z0-9+.-]*:/i.test(ep.path) || ep.path.startsWith('//') || ep.path.includes('://')) {
        problems.push(`${where}.path must be relative to baseUrl, never a full URL: the target host is fixed by baseUrl (policy section 7)`);
      }
      if (ep.body !== undefined && ep.bodies !== undefined) problems.push(`${where} has both body and bodies; use one`);
      if (ep.bodies !== undefined && (!Array.isArray(ep.bodies) || ep.bodies.length === 0)) {
        problems.push(`${where}.bodies must be a non-empty array (one body per VU, used round-robin)`);
      }
      if (ep.query !== undefined) {
        if (method !== 'POST') problems.push(`${where}.query applies only to POST endpoints; ${method || 'this method'} is never a query`);
        else if (!isObject(ep.query) || !nonEmptyString(ep.query.confirmedBy) || !nonEmptyString(ep.query.evidence)) {
          problems.push(`${where}.query must be { "confirmedBy": who confirmed it has no side effect, "evidence": how } (policy section 1)`);
        }
      }
      if (ep.expect !== undefined) {
        const ex = ep.expect;
        if (!isObject(ex)) problems.push(`${where}.expect must be an object`);
        else {
          if (ex.status !== undefined && !(Number.isInteger(ex.status) && ex.status >= 100 && ex.status <= 599)) {
            problems.push(`${where}.expect.status must be an HTTP status code`);
          }
          if (ex.jsonField !== undefined && !nonEmptyString(ex.jsonField)) problems.push(`${where}.expect.jsonField must be a field name`);
          if (ex.jsonValue !== undefined && ex.jsonField === undefined) problems.push(`${where}.expect.jsonValue needs expect.jsonField`);
        }
      }
      if (ep.load !== undefined) {
        const own = describeLoad(ep.load);
        if (own.error) problems.push(`${where} ${own.error}`);
      } else if (plan.load === undefined) {
        problems.push(`${where} has no load and the plan has no default load`);
      }
      if (ep.dataVolume !== undefined && !nonEmptyString(ep.dataVolume)) problems.push(`${where}.dataVolume must be text`);
    });
  }

  validateCriteria(plan.exitCriteria, tags, problems);
  validateComparison(plan.comparison, tags, problems);
  if (plan.context !== undefined && !(Array.isArray(plan.context) && plan.context.every(nonEmptyString))) {
    problems.push('context must be an array of sentences');
  }
  if (plan.requestTimeout !== undefined && parseDuration(plan.requestTimeout) === null) {
    problems.push('requestTimeout must be a duration like "60s"');
  }
  if (plan.outDir !== undefined && !nonEmptyString(plan.outDir)) problems.push('outDir must be a folder path');
  return problems;
}

// --- Safety rules ------------------------------------------------------------------

function refusal(rule, section, detail, reference) {
  const where = reference || `${POLICY}, section ${section}`;
  return { rule, section, message: `[${rule}] ${detail} (${where})` };
}

/** Policy section 7: the target is the declared QA host and never production. */
function environmentRefusals(plan, manifest) {
  const out = [];
  const target = hostOf(plan.baseUrl);
  if (/prod/i.test(String(plan.baseUrl))) {
    out.push(refusal('environment', 7, `baseUrl ${plan.baseUrl} contains "prod"; a performance run never targets anything that looks like production`));
  }
  const declared = isObject(manifest) && isObject(manifest.project) ? manifest.project.qaBaseUrl : undefined;
  const declaredHost = hostOf(declared);
  if (!declaredHost) {
    out.push(refusal('environment', 7, 'qa/qa-framework.config.json has no http(s) project.qaBaseUrl; runs go only to the declared QA environment'));
  } else if (target !== declaredHost) {
    out.push(refusal('environment', 7, `baseUrl host ${target || '(none)'} is not the declared QA host ${declaredHost} (project.qaBaseUrl)`));
  }
  return out;
}

function validateConcurrentWrite(cw, load, tag, runDate) {
  const problems = [];
  const required = ['approvedBy', 'approvedOn', 'reason', 'account', 'confirmation'];
  for (const key of required) if (!nonEmptyString(cw[key])) problems.push(`concurrentWrite.${key} is required`);
  if (nonEmptyString(cw.approvedOn) && !DATE_PATTERN.test(cw.approvedOn)) problems.push('concurrentWrite.approvedOn must be YYYY-MM-DD');
  else if (nonEmptyString(cw.approvedOn) && cw.approvedOn !== runDate) {
    problems.push(`concurrentWrite.approvedOn is ${cw.approvedOn}; an authorization covers one run on the day it was given (today is ${runDate})`);
  }
  if (!positiveInt(cw.maxVus)) problems.push('concurrentWrite.maxVus is required (an integer >= 1)');
  if (!(Number.isInteger(cw.expectedRecords) && cw.expectedRecords >= 0)) {
    problems.push('concurrentWrite.expectedRecords is required: how many records this run leaves behind');
  }
  if (cw.maxIterations === undefined && cw.maxDuration === undefined) {
    problems.push('concurrentWrite needs a cap: maxIterations or maxDuration, never an open-ended ramp');
  }
  if (cw.maxIterations !== undefined && !positiveInt(cw.maxIterations)) problems.push('concurrentWrite.maxIterations must be an integer >= 1');
  const capSeconds = cw.maxDuration === undefined ? null : parseDuration(cw.maxDuration);
  if (cw.maxDuration !== undefined && capSeconds === null) problems.push('concurrentWrite.maxDuration must be a duration like "30s"');
  if (problems.length) return problems;

  if (load.maxVus > cw.maxVus) problems.push(`the load reaches ${load.maxVus} VUs, above the authorized maxVus ${cw.maxVus}`);
  if (load.shape === 'iterations') {
    if (cw.maxIterations === undefined) problems.push('the load is counted in iterations; the authorization must cap maxIterations');
    else if (load.iterations > cw.maxIterations) problems.push(`the load runs ${load.iterations} iterations, above the authorized maxIterations ${cw.maxIterations}`);
  } else if (capSeconds === null) {
    problems.push(`the load is time-based (${load.shape}); the authorization must cap maxDuration`);
  } else if (load.durationSeconds > capSeconds) {
    problems.push(`the load runs ${load.durationSeconds}s, above the authorized maxDuration ${cw.maxDuration}`);
  }
  return problems.map((p) => `endpoint ${tag}: ${p}`);
}

/** Policy section 6 and gate 1 of section 2, per endpoint. */
function writeRefusals(plan, options) {
  const out = [];
  const runDate = options.today || today();
  let writes = 0;
  for (const ep of plan.endpoints) {
    const load = describeLoad(ep.load !== undefined ? ep.load : plan.load);
    const method = String(ep.method).toUpperCase();
    if (effectOf(ep) === 'read') {
      if (ep.concurrentWrite !== undefined) {
        out.push(refusal('write-under-load', 6, `endpoint ${ep.tag} is a read; concurrentWrite applies only to write endpoints. Remove it`));
      }
      continue;
    }
    writes += 1;
    if (!nonEmptyString(ep.writeCatalogId)) {
      out.push(refusal('write-approval', 2,
        `endpoint ${ep.tag} (${method}) is a write; name its approved entry in the project's write catalog in writeCatalogId. ` +
        'A write that has no approved catalog entry does not run under load either'));
    }
    const single = load.shape === 'iterations' && load.maxVus === 1 && load.iterations === 1;
    if (single) {
      if (ep.concurrentWrite !== undefined) {
        out.push(refusal('write-under-load', 6, `endpoint ${ep.tag} runs as a single call; remove concurrentWrite, it is not needed`));
      }
      continue;
    }
    if (ep.concurrentWrite === undefined) {
      const shape = load.shape === 'iterations'
        ? `${load.maxVus} VU(s) and ${load.iterations} iteration(s)`
        : `up to ${load.maxVus} VU(s) for ${load.durationSeconds}s with no iteration limit`;
      out.push(refusal('write-under-load', 6,
        `endpoint ${ep.tag} (${method}) is a write and would run with ${shape}. Writes are not load-tested by default: ` +
        'use "load": { "vus": 1, "iterations": 1 } for a single timed call, or add a concurrentWrite authorization from the write approver'));
      continue;
    }
    if (!isObject(ep.concurrentWrite)) {
      out.push(refusal('write-under-load', 6, `endpoint ${ep.tag}: concurrentWrite must be an object`));
      continue;
    }
    for (const problem of validateConcurrentWrite(ep.concurrentWrite, load, ep.tag, runDate)) {
      out.push(refusal('write-under-load', 6, problem));
    }
  }
  if (writes > 0 && !options.allowWrites) {
    out.push(refusal('write-opt-in', 2,
      `this plan has ${writes} write endpoint(s); writes run only when the run itself opts in with --allow-writes (gate 1). ` +
      'Never set it in shared configuration'));
  }
  return out;
}

/**
 * All safety rules for a structurally valid plan. Returns a list of
 * { rule, section, message }; empty means the run may start.
 * @param {object} plan     parsed plan (validatePlan(plan) must be empty)
 * @param {object} manifest parsed qa/qa-framework.config.json
 * @param {{ allowWrites?: boolean, today?: string }} options
 */
function safetyProblems(plan, manifest, options = {}) {
  const out = [];
  const credentialKeys = findCredentialKeys(plan, '', []);
  if (credentialKeys.length) {
    out.push(refusal('credentials', null,
      `the plan holds credential fields (${credentialKeys.join(', ')}); credentials never go in a plan. ` +
      'Name an environment variable or a gitignored file in auth.sessions instead',
      '.github/skills/qa-performance-k6/SKILL.md, "Credentials"'));
  }
  out.push(...environmentRefusals(plan, manifest));
  out.push(...writeRefusals(plan, options));
  return out;
}

/**
 * The plan k6 receives: the same plan with each endpoint's load resolved and its
 * effect stated, so the k6 script does no policy reasoning of its own. Holds no
 * secret (the plan never does).
 */
function effectivePlan(plan) {
  return {
    ...plan,
    endpoints: plan.endpoints.map((ep) => ({
      ...ep,
      method: String(ep.method).toUpperCase(),
      effect: effectOf(ep),
      load: ep.load !== undefined ? ep.load : plan.load,
    })),
  };
}

module.exports = {
  POLICY,
  TEST_TYPES,
  READ_METHODS,
  WRITE_METHODS,
  AUTH_SCHEMES,
  parseDuration,
  hostOf,
  today,
  describeLoad,
  effectOf,
  validatePlan,
  safetyProblems,
  effectivePlan,
};
