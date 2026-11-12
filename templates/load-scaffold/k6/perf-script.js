// perf-script.js - the plan-driven k6 script. Do not run it directly: run-perf.js
// validates the plan and the safety rules first, resolves the session values, and
// then starts k6 with this script. See .github/skills/qa-performance-k6/SKILL.md.
//
// Inputs (environment, set by run-perf.js; never on the command line):
//   PERF_PLAN           absolute path of the effective plan (load resolved per endpoint)
//   PERF_SUMMARY        absolute path where the raw summary JSON is written
//   PERF_SESSION_COUNT  number of session values; PERF_SESSION_0..N-1 hold them
//
// Session values are only ever placed in request headers. Nothing in this script
// prints a header, a request body or a response body: evidence keeps status, timing
// and shape, never field values (qa/00-standards/write-safety-policy.md, section 7).
// No remote modules are imported: the run needs no network access beyond the
// target QA host.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import exec from 'k6/execution';

const plan = JSON.parse(open(__ENV.PERF_PLAN));

const sessionCount = Number(__ENV.PERF_SESSION_COUNT || 0);
const sessions = [];
for (let i = 0; i < sessionCount; i += 1) sessions.push(__ENV[`PERF_SESSION_${i}`]);

function authHeaders(vuId) {
  if (plan.auth.scheme === 'none' || sessions.length === 0) return {};
  // Round-robin by VU: several independent sessions avoid measuring a server that
  // serializes concurrent requests of one session instead of its real capacity.
  const value = sessions[(vuId - 1) % sessions.length];
  if (plan.auth.scheme === 'cookie') return { Cookie: value };
  if (plan.auth.scheme === 'bearer') return { Authorization: `Bearer ${value}` };
  return { [plan.auth.headerName]: value };
}

// Status codes counted per endpoint. Metrics must exist in the init context, so the
// list is fixed; anything else is counted as "other". 0 = no response (network error
// or client timeout).
const STATUS_CODES = ['0', '200', '201', '204', '301', '302', '400', '401', '403', '404', '408', '409', '429', '500', '502', '503', '504', 'other'];

const trends = {};
const calls = {};
const failed = {};
const statuses = {};
const thresholds = {};
const scenarios = {};

function budgetFor(tag) {
  const own = (plan.exitCriteria.perEndpoint || {})[tag] || {};
  return {
    p95Ms: own.p95Ms !== undefined ? own.p95Ms : plan.exitCriteria.p95Ms,
    p99Ms: own.p99Ms !== undefined ? own.p99Ms : plan.exitCriteria.p99Ms,
  };
}

function scenarioFor(load) {
  if (load.stages) return { executor: 'ramping-vus', exec: 'hit', startVUs: 0, stages: load.stages, gracefulRampDown: '5s' };
  if (load.iterations) return { executor: 'shared-iterations', exec: 'hit', vus: load.vus, iterations: load.iterations };
  return { executor: 'constant-vus', exec: 'hit', vus: load.vus, duration: load.duration };
}

for (const ep of plan.endpoints) {
  trends[ep.tag] = new Trend(`duration_${ep.tag}`, true);
  calls[ep.tag] = new Counter(`calls_${ep.tag}`);
  failed[ep.tag] = new Counter(`failedcalls_${ep.tag}`);
  statuses[ep.tag] = {};
  for (const code of STATUS_CODES) statuses[ep.tag][code] = new Counter(`status_${ep.tag}_${code}`);
  const budget = budgetFor(ep.tag);
  thresholds[`duration_${ep.tag}`] = [`p(95)<${budget.p95Ms}`];
  if (budget.p99Ms !== undefined) thresholds[`duration_${ep.tag}`].push(`p(99)<${budget.p99Ms}`);
  // Any failed call breaks the run: a percentile over failed calls is not a result.
  thresholds[`failedcalls_${ep.tag}`] = ['count<1'];
  // One scenario per endpoint, so endpoints run concurrently for the whole window
  // instead of one slow endpoint starving the others inside a shared loop.
  scenarios[ep.tag] = scenarioFor(ep.load);
}

export const options = {
  scenarios,
  thresholds,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

function readField(body, field) {
  try {
    const parsed = JSON.parse(body);
    return { json: true, value: parsed === null || typeof parsed !== 'object' ? undefined : parsed[field] };
  } catch (e) {
    return { json: false, value: undefined };
  }
}

export function hit() {
  const ep = plan.endpoints.find((e) => e.tag === exec.scenario.name);
  const vuId = exec.vu.idInTest;
  const base = String(plan.baseUrl).replace(/\/+$/, '');
  const url = `${base}/${String(ep.path).replace(/^\/+/, '')}`;
  const params = {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...authHeaders(vuId) },
    tags: { endpoint: ep.tag },
    timeout: plan.requestTimeout || '60s',
  };
  let payload = null;
  if (ep.method !== 'GET' && ep.method !== 'HEAD') {
    const body = ep.bodies ? ep.bodies[(vuId - 1) % ep.bodies.length] : (ep.body || {});
    payload = JSON.stringify(body);
  }
  const res = http.request(ep.method, url, payload, params);

  const expect = ep.expect || {};
  const wantStatus = expect.status !== undefined ? expect.status : 200;
  const statusOk = res.status === wantStatus;
  let contractOk = true;
  const named = {};
  named[`${ep.tag}: status ${wantStatus}`] = () => statusOk;
  if (expect.jsonField) {
    const field = readField(res.body, expect.jsonField);
    const wanted = expect.jsonValue !== undefined ? expect.jsonValue : true;
    contractOk = field.json && field.value === wanted;
    named[`${ep.tag}: ${expect.jsonField} is ${JSON.stringify(wanted)}`] = () => contractOk;
  }
  check(res, named);

  trends[ep.tag].add(res.timings.duration);
  calls[ep.tag].add(1);
  failed[ep.tag].add(statusOk && contractOk ? 0 : 1);
  const code = String(res.status);
  statuses[ep.tag][code in statuses[ep.tag] ? code : 'other'].add(1);
  if (__ENV.PERF_DEBUG) console.log(`[${ep.tag}] vu=${vuId} status=${res.status} ms=${Math.round(res.timings.duration)} error=${res.error || ''}`);
  sleep(plan.thinkTimeSeconds !== undefined ? plan.thinkTimeSeconds : 1);
}

export function handleSummary(data) {
  const fmt = (n) => (typeof n === 'number' ? String(Math.round(n)) : '-');
  const rows = plan.endpoints.map((ep) => {
    const v = (data.metrics[`duration_${ep.tag}`] || {}).values || {};
    const c = (data.metrics[`calls_${ep.tag}`] || {}).values || {};
    const f = (data.metrics[`failedcalls_${ep.tag}`] || {}).values || {};
    return `  ${ep.tag}: calls=${c.count || 0} failed=${f.count || 0} avg=${fmt(v.avg)} p90=${fmt(v['p(90)'])} ` +
      `p95=${fmt(v['p(95)'])} p99=${fmt(v['p(99)'])} max=${fmt(v.max)} ms, ${c.rate ? c.rate.toFixed(2) : '-'} req/s`;
  });
  const out = {};
  out[__ENV.PERF_SUMMARY] = JSON.stringify(data, null, 2);
  out.stdout = `\nk6 run finished. Per endpoint:\n${rows.join('\n')}\n`;
  return out;
}
