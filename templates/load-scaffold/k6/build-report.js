'use strict';

/**
 * build-report.js - builds the markdown execution report of a k6 run from the raw
 * k6 summary JSON and the plan that ran.
 *
 * run-perf.js calls build() after every run. Standalone, it rebuilds a report from
 * saved files, so a report is reproducible from its evidence folder:
 *
 *   node build-report.js <k6-summary.json> <plan.json> <out.md> [run-stamp]
 *
 * Verdict rules (see .github/skills/qa-performance-k6/SKILL.md, "Reading the result"):
 *   - the exit criteria are the ones the plan declared before the run; nothing here
 *     changes or relaxes them;
 *   - an endpoint with any failed call is INVALID, never MET: its percentiles are
 *     computed over failed calls (timeouts, errors) and are not a performance result;
 *   - an endpoint with no completed call is NO DATA;
 *   - the run is MET only when every endpoint is MET.
 *
 * No session value is ever read here: the report names where sessions came from
 * (variable names, file names), never their content.
 */

const fs = require('fs');
const path = require('path');

const LOW_SAMPLE_COUNT = 30;
const VERDICT = Object.freeze({ MET: 'MET', NOT_MET: 'NOT MET', INVALID: 'INVALID', NO_DATA: 'NO DATA' });

const ms = (n) => {
  if (typeof n !== 'number') return '-';
  return n >= 10000 ? `${Math.round(n)} ms (${(n / 1000).toFixed(1)} s)` : `${Math.round(n)} ms`;
};
const num = (n, d = 2) => (typeof n === 'number' ? String(Number(n.toFixed(d))) : '-');
const mb = (b) => (typeof b === 'number' ? `${(b / 1048576).toFixed(2)} MB` : '-');
const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function values(metrics, name) {
  return ((metrics || {})[name] || {}).values || {};
}

/** k6 gives checks as an array (handleSummary) or an object keyed by name (summary export). */
function checksOf(data) {
  const raw = (data.root_group && data.root_group.checks) || [];
  if (Array.isArray(raw)) return raw.map((c) => ({ name: c.name, passes: c.passes || 0, fails: c.fails || 0 }));
  return Object.entries(raw).map(([name, c]) => ({ name: c.name || name, passes: c.passes || 0, fails: c.fails || 0 }));
}

function budgetFor(plan, tag) {
  const criteria = plan.exitCriteria || {};
  const own = (criteria.perEndpoint || {})[tag] || {};
  const pick = (key) => (own[key] !== undefined ? own[key] : criteria[key]);
  return { p95Ms: pick('p95Ms'), p99Ms: pick('p99Ms'), minThroughputRps: pick('minThroughputRps') };
}

/** Measured numbers of one endpoint, from one k6 summary. */
function measure(data, tag) {
  const m = data.metrics || {};
  const d = values(m, `duration_${tag}`);
  const c = values(m, `calls_${tag}`);
  const f = values(m, `failedcalls_${tag}`);
  return {
    calls: c.count || 0,
    failed: f.count || 0,
    rate: c.rate,
    avg: d.avg, min: d.min, med: d.med, p90: d['p(90)'], p95: d['p(95)'], p99: d['p(99)'], max: d.max,
  };
}

/**
 * Verdict of one endpoint against its declared budget.
 * @returns {{ verdict: string, reasons: string[] }}
 */
function endpointVerdict(measured, budget) {
  if (!measured.calls) return { verdict: VERDICT.NO_DATA, reasons: ['no call completed'] };
  if (measured.failed > 0) {
    return { verdict: VERDICT.INVALID, reasons: [`${measured.failed} of ${measured.calls} calls failed`] };
  }
  const reasons = [];
  if (typeof budget.p95Ms === 'number' && !(measured.p95 < budget.p95Ms)) reasons.push(`p95 ${ms(measured.p95)} >= ${budget.p95Ms} ms`);
  if (typeof budget.p99Ms === 'number' && !(measured.p99 < budget.p99Ms)) reasons.push(`p99 ${ms(measured.p99)} >= ${budget.p99Ms} ms`);
  if (typeof budget.minThroughputRps === 'number' && !(measured.rate >= budget.minThroughputRps)) {
    reasons.push(`throughput ${num(measured.rate)} req/s < ${budget.minThroughputRps} req/s`);
  }
  return { verdict: reasons.length ? VERDICT.NOT_MET : VERDICT.MET, reasons };
}

function overallVerdict(verdicts) {
  if (verdicts.length === 0) return VERDICT.NO_DATA;
  if (verdicts.includes(VERDICT.INVALID)) return VERDICT.INVALID;
  if (verdicts.includes(VERDICT.NO_DATA)) return VERDICT.NO_DATA;
  if (verdicts.includes(VERDICT.NOT_MET)) return VERDICT.NOT_MET;
  return VERDICT.MET;
}

/**
 * Baseline vs candidate. The baseline is another endpoint of the same run, or the
 * same tag in an earlier saved summary (pair.baselineSummary, passed in `baselines`).
 */
function comparePair(pair, data, baselines) {
  const fromFile = pair.baselineSummary !== undefined;
  const baseData = fromFile ? (baselines || {})[pair.baselineSummary] : data;
  const candidate = measure(data, pair.candidate);
  if (!baseData) {
    return { verdict: VERDICT.NO_DATA, reasons: [`baseline summary ${pair.baselineSummary} was not loaded`], candidate, baseline: null, fromFile };
  }
  const baseline = measure(baseData, pair.baseline);
  if (!baseline.calls || !candidate.calls) {
    return { verdict: VERDICT.NO_DATA, reasons: ['baseline or candidate completed no call'], candidate, baseline, fromFile };
  }
  if (baseline.failed > 0 || candidate.failed > 0) {
    return { verdict: VERDICT.INVALID, reasons: ['failed calls in the baseline or the candidate'], candidate, baseline, fromFile };
  }
  const reasons = [];
  const speedup = baseline.avg / candidate.avg;
  const p95Change = ((candidate.p95 - baseline.p95) / baseline.p95) * 100;
  if (typeof pair.maxRegressionPct === 'number' && p95Change > pair.maxRegressionPct) {
    reasons.push(`candidate p95 is ${num(p95Change, 1)}% above the baseline (allowed ${pair.maxRegressionPct}%)`);
  }
  if (typeof pair.minSpeedup === 'number' && !(speedup >= pair.minSpeedup)) {
    reasons.push(`candidate is ${num(speedup, 2)}x the baseline speed by avg (required ${pair.minSpeedup}x)`);
  }
  return { verdict: reasons.length ? VERDICT.NOT_MET : VERDICT.MET, reasons, candidate, baseline, speedup, p95Change, fromFile };
}

function loadText(load) {
  if (!load) return '-';
  if (load.stages) return `ramping-vus: ${load.stages.map((s) => `${s.duration} to ${s.target}`).join(', ')}`;
  if (load.iterations) return `shared-iterations: ${load.vus} VU(s), ${load.iterations} iteration(s)`;
  return `constant-vus: ${load.vus} VU(s) for ${load.duration}`;
}

function effectText(ep) {
  const method = String(ep.method || '').toUpperCase();
  if (method === 'GET' || method === 'HEAD') return 'read';
  if (method === 'POST' && ep.query) return 'read (POST query)';
  return ep.concurrentWrite ? 'write (concurrent, authorized)' : 'write (single call)';
}

function sessionText(auth) {
  if (!auth || auth.scheme === 'none') return 'none (public endpoints)';
  const sources = (auth.sessions || []).map((s) => (s.env ? `environment variable ${s.env}` : `file ${path.basename(String(s.file))}`));
  const scheme = auth.scheme === 'header' ? `header ${auth.headerName}` : auth.scheme;
  return `${scheme}; ${sources.length} session source(s): ${sources.join(', ')}, assigned to VUs round-robin. Session values are never written to this report.`;
}

/**
 * @param {{ data: object, plan: object, planFile?: string, stamp?: string, baselines?: object }} input
 * @returns {string} markdown
 */
function build({ data, plan, planFile, stamp, baselines }) {
  const m = data.metrics || {};
  const checks = checksOf(data);
  const endpoints = plan.endpoints || [];
  const L = [];

  const results = endpoints.map((ep) => {
    const measured = measure(data, ep.tag);
    const budget = budgetFor(plan, ep.tag);
    return { ep, measured, budget, ...endpointVerdict(measured, budget) };
  });
  const pairs = ((plan.comparison || {}).pairs || []).map((pair) => ({ pair, ...comparePair(pair, data, baselines) }));
  const overall = overallVerdict([...results.map((r) => r.verdict), ...pairs.map((p) => p.verdict)]);

  L.push(`# k6 performance report - ${plan.topic || 'untitled'}`, '');
  L.push(`- Overall verdict: **${overall}**`);
  L.push(`- Test type (ISTQB CT-PT): ${plan.testType || 'not stated'}`);
  L.push(`- Plan: ${planFile || 'not recorded'}`);
  L.push(`- Run finished (UTC): ${stamp || 'not recorded'}`);
  L.push(`- Go-ahead: ${(plan.goAhead || {}).by || 'not recorded'}; account or lane: ${(plan.goAhead || {}).account || 'not recorded'}`);
  L.push('- Environment: the QA environment declared in qa/qa-framework.config.json (checked before the run)', '');

  // 1. Summary
  L.push('## 1. Summary against the exit criteria', '');
  L.push(`Exit criteria declared in the plan before the run (source: ${(plan.exitCriteria || {}).source || 'not stated'}). They were not changed after the run.`, '');
  L.push('| Endpoint | Calls | Failed | p95 | p95 budget | p99 | Throughput | Verdict |', '|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const why = r.reasons.length ? ` (${r.reasons.join('; ')})` : '';
    L.push(`| ${r.ep.tag} | ${r.measured.calls} | ${r.measured.failed} | ${ms(r.measured.p95)} | ${typeof r.budget.p95Ms === 'number' ? `< ${r.budget.p95Ms} ms` : '-'} | ` +
      `${ms(r.measured.p99)} | ${num(r.measured.rate)} req/s | ${r.verdict}${cell(why)} |`);
  }
  L.push('');
  L.push('> A NOT MET endpoint is not a failed test: it is the measured result against the criterion declared before the run.');
  for (const r of results.filter((x) => x.verdict === VERDICT.INVALID)) {
    L.push(`> INVALID for ${r.ep.tag}: ${r.measured.failed} of ${r.measured.calls} calls failed. Its timings are largely those of failed calls ` +
      '(errors, timeouts) and must not be read as the performance of the endpoint. See the status codes in section 4.');
  }
  L.push('');

  // 2. Baseline vs candidate
  if (pairs.length) {
    L.push('## 2. Baseline vs candidate', '');
    L.push('| Candidate | Baseline | avg (baseline / candidate) | p95 (baseline / candidate) | Speed-up (avg) | p95 change | Criterion | Verdict |', '|---|---|---|---|---|---|---|---|');
    for (const p of pairs) {
      const b = p.baseline || {};
      const c = p.candidate || {};
      const criterion = [
        typeof p.pair.maxRegressionPct === 'number' ? `p95 at most ${p.pair.maxRegressionPct}% above baseline` : null,
        typeof p.pair.minSpeedup === 'number' ? `at least ${p.pair.minSpeedup}x faster by avg` : null,
      ].filter(Boolean).join('; ');
      const why = p.reasons.length ? ` (${p.reasons.join('; ')})` : '';
      const baseName = p.fromFile ? `${p.pair.baseline} (earlier run: ${path.basename(String(p.pair.baselineSummary))})` : p.pair.baseline;
      L.push(`| ${p.pair.candidate} | ${cell(baseName)} | ${ms(b.avg)} / ${ms(c.avg)} | ${ms(b.p95)} / ${ms(c.p95)} | ` +
        `${typeof p.speedup === 'number' ? `${num(p.speedup, 2)}x` : '-'} | ${typeof p.p95Change === 'number' ? `${num(p.p95Change, 1)}%` : '-'} | ${cell(criterion)} | ${p.verdict}${cell(why)} |`);
    }
    L.push('');
    if (pairs.some((p) => p.fromFile)) {
      L.push('> A baseline from an earlier run is comparable only under the same load, the same data volume and similar environment activity. State any difference in section 6.', '');
    }
  }

  // 3. Configuration
  L.push('## 3. Configuration', '');
  L.push(`- Base URL: ${plan.baseUrl}`);
  L.push(`- Authentication: ${sessionText(plan.auth)}`);
  L.push(`- Request timeout: ${plan.requestTimeout || '60s'}; think time between calls: ${plan.thinkTimeSeconds !== undefined ? plan.thinkTimeSeconds : 1} s`);
  L.push('- Executor: one k6 scenario per endpoint, all running at the same time; each endpoint timing includes the server contention the others cause.', '');
  L.push('| Endpoint (tag) | Method | Path | Effect | Load | Data volume |', '|---|---|---|---|---|---|');
  for (const ep of endpoints) {
    L.push(`| ${ep.tag} | ${String(ep.method).toUpperCase()} | ${cell(ep.path)} | ${effectText(ep)} | ${cell(loadText(ep.load || plan.load))} | ${cell(ep.dataVolume || 'NOT STATED')} |`);
  }
  L.push('');
  const queries = endpoints.filter((ep) => ep.query);
  if (queries.length) {
    L.push('POST endpoints treated as reads (declared queries):', '');
    for (const ep of queries) L.push(`- ${ep.tag}: confirmed by ${ep.query.confirmedBy}; evidence: ${ep.query.evidence}`);
    L.push('');
  }
  const writes = endpoints.filter((ep) => effectText(ep).startsWith('write'));
  if (writes.length) {
    L.push('Write endpoints (qa/00-standards/write-safety-policy.md, section 6):', '');
    for (const ep of writes) {
      const cw = ep.concurrentWrite;
      L.push(cw
        ? `- ${ep.tag}: catalog entry ${ep.writeCatalogId}; concurrent write authorized by ${cw.approvedBy} on ${cw.approvedOn} (${cw.reason}); ` +
          `cap ${cw.maxVus} VU(s)${cw.maxIterations !== undefined ? `, ${cw.maxIterations} iteration(s)` : ''}${cw.maxDuration !== undefined ? `, ${cw.maxDuration}` : ''}; ` +
          `expected records left behind: ${cw.expectedRecords}; account: ${cw.account}; confirmation: ${cw.confirmation}`
        : `- ${ep.tag}: catalog entry ${ep.writeCatalogId}; single real call (1 VU, 1 iteration) for timing only`);
    }
    L.push('');
  }

  // 4. Results per endpoint
  const dur = (data.state && data.state.testRunDurationMs) || 0;
  const reqs = values(m, 'http_reqs');
  L.push('## 4. Results per endpoint', '');
  L.push(`- Total duration: ${num(dur / 1000, 1)} s; HTTP requests: ${reqs.count || 0} (${num(reqs.rate)} req/s overall); ` +
    `max VUs: ${values(m, 'vus_max').max || values(m, 'vus_max').value || '-'}; iterations: ${values(m, 'iterations').count || 0}`);
  L.push(`- Data received: ${mb(values(m, 'data_received').count)}; sent: ${mb(values(m, 'data_sent').count)}`, '');
  L.push('| Endpoint | Calls | avg | min | med | p90 | p95 | p99 | max | req/s |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const x = r.measured;
    L.push(`| ${r.ep.tag} | ${x.calls} | ${ms(x.avg)} | ${ms(x.min)} | ${ms(x.med)} | ${ms(x.p90)} | ${ms(x.p95)} | ${ms(x.p99)} | ${ms(x.max)} | ${num(x.rate)} |`);
  }
  L.push('');
  const codeRows = [];
  for (const ep of endpoints) {
    const prefix = `status_${ep.tag}_`;
    for (const [name, metric] of Object.entries(m)) {
      if (!name.startsWith(prefix) || !metric.values || !(metric.values.count > 0)) continue;
      const code = name.slice(prefix.length);
      codeRows.push(`| ${ep.tag} | ${code === '0' ? '0 (no response: network error or client timeout)' : code} | ${metric.values.count} |`);
    }
  }
  if (codeRows.length) L.push('### HTTP status codes per endpoint', '', '| Endpoint | Status | Count |', '|---|---|---|', ...codeRows, '');
  for (const r of results.filter((x) => x.measured.calls > 0 && x.measured.calls < LOW_SAMPLE_COUNT)) {
    L.push(`> ${r.ep.tag} completed only ${r.measured.calls} call(s): its p95 and p99 are indicative, not statistically robust.`);
  }
  if (results.some((x) => x.measured.calls > 0 && x.measured.calls < LOW_SAMPLE_COUNT)) L.push('');

  // 5. Checks and global metrics
  L.push('## 5. Checks and global HTTP metrics', '');
  L.push('| Check | Passed | Failed |', '|---|---|---|');
  for (const c of checks) L.push(`| ${cell(c.name)} | ${c.passes} | ${c.fails} |`);
  if (!checks.length) L.push('| (no checks recorded) | - | - |');
  L.push('', '| Metric | avg | min | med | p90 | p95 | p99 | max |', '|---|---|---|---|---|---|---|---|');
  for (const k of ['http_req_duration', 'http_req_waiting', 'http_req_receiving', 'http_req_sending', 'http_req_connecting', 'http_req_tls_handshaking', 'http_req_blocked', 'iteration_duration']) {
    const v = (m[k] || {}).values;
    if (v) L.push(`| ${k} | ${ms(v.avg)} | ${ms(v.min)} | ${ms(v.med)} | ${ms(v['p(90)'])} | ${ms(v['p(95)'])} | ${ms(v['p(99)'])} | ${ms(v.max)} |`);
  }
  L.push('');

  // 6. Context and limitations
  L.push('## 6. Context, assumptions and limitations', '');
  for (const line of plan.context || []) L.push(`- ${line}`);
  const unstated = endpoints.filter((ep) => !ep.dataVolume).map((ep) => ep.tag);
  L.push(unstated.length
    ? `- Data representativeness: NOT STATED for ${unstated.join(', ')}. A fast p95 over an empty or near-empty dataset is not evidence of real performance; state the record volume behind each result before using it.`
    : '- Data representativeness: the data volume behind each endpoint is stated in section 3. A result is representative only of that volume.');
  L.push(plan.serverMonitoring
    ? `- Server monitoring: ${plan.serverMonitoring}`
    : '- Server monitoring: none recorded. Client-side timing alone cannot tell a slow endpoint from a saturated server; watch server CPU, memory and errors for anything beyond a quick check.');
  L.push('- The QA environment is shared: other activity during the window adds to the measured load.');
  L.push('- One run is one sample: repeat at another time before using a result as a baseline.', '');

  // Annexes
  L.push('## Annex A. All metrics recorded by k6', '', '| Metric | Type | Values |', '|---|---|---|');
  for (const [k, v] of Object.entries(m)) {
    const vals = Object.entries(v.values || {}).map(([a, b]) => `${a}=${num(b, 3)}`).join('; ');
    L.push(`| ${k} | ${v.type || '-'} | ${cell(vals)} |`);
  }
  L.push('', '## Annex B. Plan used', '', '```json', JSON.stringify(plan, null, 2), '```', '');
  return L.join('\n');
}

module.exports = { VERDICT, LOW_SAMPLE_COUNT, build, measure, endpointVerdict, overallVerdict, comparePair, budgetFor };

if (require.main === module) {
  const [summaryFile, planFile, outFile, stamp] = process.argv.slice(2);
  if (!summaryFile || !planFile || !outFile) {
    console.error('Usage: node build-report.js <k6-summary.json> <plan.json> <out.md> [run-stamp]');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
  const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  const baselines = {};
  for (const pair of (plan.comparison || {}).pairs || []) {
    if (pair.baselineSummary === undefined) continue;
    const file = path.resolve(__dirname, pair.baselineSummary);
    if (fs.existsSync(file)) baselines[pair.baselineSummary] = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  fs.writeFileSync(outFile, build({ data, plan, planFile, stamp, baselines }), 'utf8');
  console.log(`Report written: ${outFile}`);
}
