'use strict';

/**
 * Tests for the integration scaffold guard (templates/integration-scaffold/scripts/
 * api-guard.js), which implements templates/write-safety-policy.md: the read-only
 * guard, the four write gates in the policy's order, the environment check, the
 * add-only hard exclusions and the response-contract helpers.
 *
 * Everything here is pure: no network, no file system.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SCRIPTS = path.join(__dirname, '..', 'templates', 'integration-scaffold', 'scripts');
const guard = require(path.join(SCRIPTS, 'api-guard.js'));
const { FRAMEWORK_EXCLUSIONS } = require(path.join(SCRIPTS, 'hard-exclusions.js'));

const PREFIX = 'QA-API-';
const QA_URL = 'https://app.qa.example.com';
const MANIFEST = { project: { qaBaseUrl: `${QA_URL}/` } };

const READS = [
  { id: 'items-list', method: 'POST', path: 'api/items/list', body: { page: 1 } },
  { id: 'item-by-id', method: 'GET', path: 'api/items/{id}' },
  { id: 'status', method: 'GET', path: '/api/status', auth: 'none' },
];

function approved(overrides = {}) {
  return {
    id: 'item-edit',
    method: 'PUT',
    path: 'api/items/Edit',
    scope: 'isolated',
    approval: { by: 'QA lead', date: '2026-11-01', revert: 'edit back to the previous value' },
    ...overrides,
  };
}

function writeContext(overrides = {}) {
  return {
    env: { QA_API_WRITE: '1' },
    writeCatalog: [approved()],
    projectExclusions: [],
    recordPrefix: PREFIX,
    baseUrl: QA_URL,
    manifest: MANIFEST,
    ...overrides,
  };
}

const ownRecord = { endpoint: 'item-edit', testRecord: 'QA-API-ITEM' };

// --- Read guard -----------------------------------------------------------------

test('read: a catalogued endpoint is allowed by id and by method + path', () => {
  const byId = guard.decideRead({ endpoint: 'items-list' }, { readCatalog: READS });
  assert.equal(byId.allowed, true);
  assert.equal(byId.method, 'POST');
  assert.equal(byId.path, 'api/items/list');

  const byRequest = guard.decideRead({ endpoint: { method: 'get', path: '/api/status' } }, { readCatalog: READS });
  assert.equal(byRequest.allowed, true);
  assert.equal(byRequest.entry.id, 'status');
});

test('read: an endpoint outside the catalog is rejected and the message names the read catalog', () => {
  const d = guard.decideRead({ endpoint: { method: 'GET', path: 'api/not-catalogued' } }, { readCatalog: READS });
  assert.equal(d.allowed, false);
  assert.equal(d.gate, guard.GATES.READ);
  assert.match(d.message, /^\[api-guard\] read-catalog: .*not in the read catalog.*Nothing was sent/);
});

test('read: a catalogued path with another method is a different endpoint and is rejected', () => {
  const d = guard.decideRead({ endpoint: { method: 'POST', path: 'api/status' } }, { readCatalog: READS });
  assert.equal(d.allowed, false);
  assert.equal(d.gate, guard.GATES.READ);
});

test('read: an unknown id is rejected', () => {
  assert.equal(guard.decideRead({ endpoint: 'nope' }, { readCatalog: READS }).allowed, false);
});

test('read: an endpoint that the write catalog declares is rejected even if it is in the read catalog', () => {
  const reads = [...READS, { id: 'sneaky', method: 'POST', path: 'api/items/Register' }];
  const writes = [approved({ id: 'item-register', method: 'POST', path: 'api/items/Register' })];
  const d = guard.decideRead({ endpoint: 'sneaky' }, { readCatalog: reads, writeCatalog: writes });
  assert.equal(d.allowed, false);
  assert.match(d.message, /declared as a write/);
});

test('read: a read catalog entry with a write method is rejected', () => {
  const d = guard.decideRead({ endpoint: 'del' }, { readCatalog: [{ id: 'del', method: 'DELETE', path: 'api/items/1' }] });
  assert.equal(d.allowed, false);
  assert.match(d.message, /reads use GET or POST/);
});

test('read: path parameters are encoded, and missing or unknown ones are rejected', () => {
  const ok = guard.decideRead({ endpoint: 'item-by-id', params: { id: '1/../../admin' } }, { readCatalog: READS });
  assert.equal(ok.allowed, true);
  assert.equal(ok.path, 'api/items/1%2F..%2F..%2Fadmin');

  assert.match(guard.decideRead({ endpoint: 'item-by-id' }, { readCatalog: READS }).message, /missing path parameter "id"/);
  assert.match(
    guard.decideRead({ endpoint: 'item-by-id', params: { id: 1, extra: 2 } }, { readCatalog: READS }).message,
    /unknown path parameter\(s\) extra/
  );
});

// --- Write gates, in order ----------------------------------------------------------

test('write: all four gates and the environment pass for an approved, isolated entry on an own record', () => {
  const d = guard.decideWrite(ownRecord, writeContext());
  assert.equal(d.allowed, true, d.message);
  assert.equal(d.method, 'PUT');
  assert.equal(d.path, 'api/items/Edit');
});

test('gate 1: without QA_API_WRITE=1 every write is rejected first, before the catalog is even consulted', () => {
  for (const env of [{}, { QA_API_WRITE: 'true' }, { QA_API_WRITE: '0' }, { QA_API_WRITE: ' 1' }, { QA_API_WRITE: 'yes' }]) {
    const d = guard.decideWrite({ endpoint: 'not-even-catalogued' }, writeContext({ env }));
    assert.equal(d.allowed, false);
    assert.equal(d.gate, guard.GATES.OPT_IN, JSON.stringify(env));
    assert.match(d.message, /^\[api-guard\] gate 1 \(opt-in\): .*npm run test:write.*Nothing was sent/);
  }
});

test('gate 2: an endpoint outside the write catalog is rejected', () => {
  const d = guard.decideWrite({ endpoint: { method: 'POST', path: 'api/items/Register' }, testRecord: 'QA-API-X' }, writeContext());
  assert.equal(d.gate, guard.GATES.CATALOG);
  assert.match(d.message, /not in the write catalog/);
});

test('gate 2: a catalogued path with another method is rejected', () => {
  const d = guard.decideWrite({ endpoint: { method: 'POST', path: 'api/items/Edit' }, testRecord: 'QA-API-X' }, writeContext());
  assert.equal(d.gate, guard.GATES.CATALOG);
});

test('gate 2: scope "forbidden" never passes, even with gate 1 open', () => {
  const d = guard.decideWrite(ownRecord, writeContext({ writeCatalog: [approved({ scope: 'forbidden' })] }));
  assert.equal(d.gate, guard.GATES.CATALOG);
  assert.match(d.message, /"forbidden"/);
});

test('gate 2: an unknown scope is rejected (the Spanish or misspelled names are not aliases)', () => {
  for (const scope of ['prohibido', 'aislado', 'isolate', undefined]) {
    const d = guard.decideWrite(ownRecord, writeContext({ writeCatalog: [approved({ scope })] }));
    assert.equal(d.gate, guard.GATES.CATALOG, String(scope));
    assert.match(d.message, /scope must be one of isolated, syncs, forbidden/);
  }
});

test('gate 2: every approval field is required - who, when, how to revert', () => {
  const cases = [
    [{ approval: undefined }, /approval\.by/],
    [{ approval: { by: '', date: '2026-11-01', revert: 'x' } }, /approval\.by/],
    [{ approval: { by: '<to be named by the project>', date: '2026-11-01', revert: 'x' } }, /approval\.by/],
    [{ approval: { by: 'QA lead', date: '', revert: 'x' } }, /approval\.date/],
    [{ approval: { by: 'QA lead', date: '01/11/2026', revert: 'x' } }, /approval\.date/],
    [{ approval: { by: 'QA lead', date: '2026-13-45', revert: 'x' } }, /approval\.date/],
    [{ approval: { by: 'QA lead', date: '2026-11-01' } }, /approval\.revert/],
  ];
  for (const [overrides, expected] of cases) {
    const d = guard.decideWrite(ownRecord, writeContext({ writeCatalog: [approved(overrides)] }));
    assert.equal(d.gate, guard.GATES.CATALOG, JSON.stringify(overrides));
    assert.match(d.message, expected);
  }
});

test('gate 2: scope "syncs" needs the downstream statement; with it, it passes', () => {
  const missing = guard.decideWrite(ownRecord, writeContext({ writeCatalog: [approved({ scope: 'syncs' })] }));
  assert.equal(missing.gate, guard.GATES.CATALOG);
  assert.match(missing.message, /approval\.downstream/);

  const stated = approved({
    scope: 'syncs',
    approval: { by: 'QA lead', date: '2026-11-01', revert: 'deactivate', downstream: 'ERP QA instance (non-production, confirmed by ops)' },
  });
  assert.equal(guard.decideWrite(ownRecord, writeContext({ writeCatalog: [stated] })).allowed, true);
});

test('gate 2: a write entry with a read method is rejected', () => {
  const d = guard.decideWrite(ownRecord, writeContext({ writeCatalog: [approved({ method: 'GET' })] }));
  assert.equal(d.gate, guard.GATES.CATALOG);
  assert.match(d.message, /method must be one of POST, PUT, PATCH, DELETE/);
});

test('gate 3: an approved entry on an excluded path is rejected, independently of the catalog', () => {
  const entry = approved({ path: 'api/notifications/SendEmail' });
  const d = guard.decideWrite(ownRecord, writeContext({ writeCatalog: [entry] }));
  assert.equal(d.gate, guard.GATES.EXCLUSIONS);
  assert.match(d.message, /^\[api-guard\] gate 3 \(hard exclusions\): .*framework exclusion "notifications".*No catalog entry can allow it/);
});

test('gate 3: the resolved path is checked too, not only the template', () => {
  const entry = approved({ path: 'api/{area}/Edit' });
  const d = guard.decideWrite({ ...ownRecord, params: { area: 'invoice' } }, writeContext({ writeCatalog: [entry] }));
  assert.equal(d.gate, guard.GATES.EXCLUSIONS);
  assert.match(d.message, /dispatch-legal-documents/);
});

test('gate 4: the target record must carry the test prefix and be more than the prefix', () => {
  for (const testRecord of [undefined, '', 'Customer ACME', 'qa-api-item', 'QA-API-', 'XQA-API-ITEM']) {
    const d = guard.decideWrite({ endpoint: 'item-edit', testRecord }, writeContext());
    assert.equal(d.gate, guard.GATES.OWN_RECORD, String(testRecord));
    assert.match(d.message, /prefix "QA-API-"/);
  }
});

test('gate 4: an empty prefix configuration fails closed', () => {
  const d = guard.decideWrite(ownRecord, writeContext({ recordPrefix: '  ' }));
  assert.equal(d.gate, guard.GATES.OWN_RECORD);
  assert.match(d.message, /no test record prefix is configured/);
});

test('environment: writes run only against the host declared in project.qaBaseUrl, never production', () => {
  const cases = [
    [{ baseUrl: undefined }, /QA_BASE_URL is not an http\(s\) URL/],
    [{ baseUrl: 'ftp://app.qa.example.com' }, /QA_BASE_URL is not an http\(s\) URL/],
    [{ baseUrl: 'https://app.prod.example.com', manifest: { project: { qaBaseUrl: 'https://app.prod.example.com' } } }, /looks like production/],
    [{ baseUrl: 'https://production-api.example.com' }, /looks like production/],
    [{ manifest: undefined }, /no http\(s\) project\.qaBaseUrl/],
    [{ manifest: { project: { qaBaseUrl: '{{QA_BASE_URL}}' } } }, /no http\(s\) project\.qaBaseUrl/],
    [{ baseUrl: 'https://other.qa.example.com' }, /is not the declared QA host app\.qa\.example\.com/],
  ];
  for (const [overrides, expected] of cases) {
    const d = guard.decideWrite(ownRecord, writeContext(overrides));
    assert.equal(d.gate, guard.GATES.ENVIRONMENT, JSON.stringify(overrides));
    assert.match(d.message, expected);
  }
});

test('gates run in the policy order: the first failing gate is the one reported', () => {
  // Everything wrong at once: the opt-in is reported.
  const allWrong = {
    env: {},
    writeCatalog: [approved({ scope: 'forbidden', path: 'api/mail/Send' })],
    recordPrefix: PREFIX,
    baseUrl: 'https://prod.example.com',
  };
  assert.equal(guard.decideWrite({ endpoint: 'item-edit', testRecord: 'x' }, allWrong).gate, guard.GATES.OPT_IN);
  // Open gate 1: the catalog is reported, not the exclusion or the record.
  allWrong.env = { QA_API_WRITE: '1' };
  assert.equal(guard.decideWrite({ endpoint: 'item-edit', testRecord: 'x' }, allWrong).gate, guard.GATES.CATALOG);
  // Fix the scope: the exclusion is reported, not the record or the host.
  allWrong.writeCatalog = [approved({ path: 'api/mail/Send' })];
  assert.equal(guard.decideWrite({ endpoint: 'item-edit', testRecord: 'x' }, allWrong).gate, guard.GATES.EXCLUSIONS);
  // Fix the path: the record is reported, not the host.
  allWrong.writeCatalog = [approved()];
  assert.equal(guard.decideWrite({ endpoint: 'item-edit', testRecord: 'x' }, allWrong).gate, guard.GATES.OWN_RECORD);
  // Fix the record: the host is reported.
  assert.equal(guard.decideWrite(ownRecord, allWrong).gate, guard.GATES.ENVIRONMENT);
});

test('assertWrite / assertRead throw with the gate on the error, and return the decision when allowed', () => {
  assert.throws(() => guard.assertWrite(ownRecord, writeContext({ env: {} })), (err) => err.gate === guard.GATES.OPT_IN && /gate 1/.test(err.message));
  assert.throws(() => guard.assertRead({ endpoint: 'x' }, { readCatalog: READS }), /read-catalog/);
  assert.equal(guard.assertWrite(ownRecord, writeContext()).path, 'api/items/Edit');
});

// --- Hard exclusions: every default category ------------------------------------------

const CATEGORY_SAMPLES = {
  notifications: ['api/EmailSending/Register', 'api/notifications/queue', 'api/sms/Send', 'api/v1/push-subscriptions', 'api/Correo/Enviar', 'api/user/messages'],
  'dispatch-legal-documents': ['api/Dispatch/Register', 'api/Despacho/Crear', 'api/waybill', 'api/Invoice/Issue', 'api/TaxDocument/Create', 'api/folio/consume', 'api/customs/declaration', 'api/GuiaDespacho/Emitir', 'api/credit-note'],
  'external-transmission': ['api/SendProducer/Register', 'api/order/resendConfirmation', 'api/erp/SyncOrders', 'api/webhooks', 'api/Envio/Registrar', 'api/replicate', 'api/publishCatalog'],
  'file-generation': ['api/Report/Download', 'api/orders/ExportExcel', 'api/invoice/pdf', 'api/UploadFile/Register', 'api/files', 'api/print/label', 'api/descargar'],
  'bulk-operations': ['api/items/BulkUpdate', 'api/reception/batch', 'api/items/updateMany', 'api/MassAssign', 'api/import/csv', 'api/tasks/close-all', 'api/recepcion/masiva'],
};

test('exclusions: the framework ships the five categories of the policy, each with patterns', () => {
  assert.deepEqual(
    FRAMEWORK_EXCLUSIONS.map((c) => c.id),
    ['notifications', 'dispatch-legal-documents', 'external-transmission', 'file-generation', 'bulk-operations']
  );
  for (const c of FRAMEWORK_EXCLUSIONS) assert.ok(c.patterns.length > 0, c.id);
});

for (const [category, paths] of Object.entries(CATEGORY_SAMPLES)) {
  test(`exclusions: category "${category}" blocks its sample paths at gate 3`, () => {
    for (const p of paths) {
      const hit = guard.matchExclusion([p], []);
      assert.ok(hit, `${p} should be excluded`);
      // The first match decides the reported category; the sample is chosen so that
      // its own category is the one that fires (or an earlier, stricter one).
      const order = FRAMEWORK_EXCLUSIONS.map((c) => c.id);
      assert.ok(order.indexOf(hit.category) <= order.indexOf(category), `${p} matched ${hit.category}`);
      const d = guard.decideWrite(ownRecord, writeContext({ writeCatalog: [approved({ path: p })] }));
      assert.equal(d.gate, guard.GATES.EXCLUSIONS, p);
    }
  });
}

test('exclusions: matching is case-insensitive', () => {
  assert.ok(guard.matchExclusion(['API/EMAIL/REGISTER'], []));
  assert.ok(guard.matchExclusion(['api/email/register'], []));
});

test('exclusions: common entity names that only contain a short word are not blocked', () => {
  for (const p of ['api/UserProfile/Edit', 'api/Customer/Edit', 'api/Environment/Edit', 'api/Sprint/Edit', 'api/Portfolio/Edit', 'api/items/Edit', 'api/ProductionLine/Edit']) {
    assert.equal(guard.matchExclusion([p], []), null, p);
  }
});

test('exclusions: wordsForm splits camelCase, underscores, dashes and dots', () => {
  assert.equal(guard.wordsForm('api/UploadFile/send_now-v2.json'), 'api/upload/file/send/now/v2/json');
  assert.equal(guard.wordsForm('api/HTTPReport'), 'api/http/report');
});

// --- Add-only, by construction ------------------------------------------------------------

test('add-only: a project pattern adds a block on top of the framework list', () => {
  const project = [{ category: 'internal-systems', pattern: /legacyBridge/, reason: 'connected to production' }];
  assert.equal(guard.matchExclusion(['api/LegacyBridge/Register'], []), null);
  const hit = guard.matchExclusion(['api/LegacyBridge/Register'], project);
  assert.deepEqual([hit.category, hit.origin], ['internal-systems', 'project']);

  const d = guard.decideWrite(ownRecord, writeContext({ writeCatalog: [approved({ path: 'api/LegacyBridge/Edit' })], projectExclusions: project }));
  assert.equal(d.gate, guard.GATES.EXCLUSIONS);
  assert.match(d.message, /project exclusion "internal-systems"/);
});

test('add-only: string patterns are literal, case-insensitive substrings', () => {
  const project = [{ category: 'internal-systems', pattern: 'Acme.Bridge' }];
  assert.ok(guard.matchExclusion(['api/acme.bridge/x'], project));
  assert.equal(guard.matchExclusion(['api/acmeXbridge/x'], project), null, 'the dot is literal, not a wildcard');
});

test('add-only: whatever the project passes, every framework pattern is still evaluated', () => {
  const frameworkCount = FRAMEWORK_EXCLUSIONS.length;
  for (const project of [undefined, null, [], [{ category: 'x', pattern: 'zzz' }]]) {
    const list = guard.effectiveExclusions(project);
    assert.deepEqual(
      list.slice(0, frameworkCount).map((g) => g.category),
      FRAMEWORK_EXCLUSIONS.map((c) => c.id)
    );
    assert.ok(guard.matchExclusion(['api/Email/Send'], project), JSON.stringify(project));
  }
});

test('add-only: removal or exception keys are refused, not ignored', () => {
  for (const entry of [
    { category: 'notifications', pattern: 'mail', remove: true },
    { category: 'notifications', allow: 'api/Email/Register' },
    { category: 'notifications', pattern: 'x', except: ['mail'] },
  ]) {
    assert.throws(() => guard.effectiveExclusions([entry]), /add-only/);
    // In a write, a broken project list fails closed at gate 3.
    const d = guard.decideWrite(ownRecord, writeContext({ projectExclusions: [entry] }));
    assert.equal(d.gate, guard.GATES.EXCLUSIONS);
  }
});

test('add-only: malformed project entries are refused', () => {
  for (const bad of [{}, 'mail', [{ category: '', pattern: 'x' }], [{ category: 'x' }], [{ category: 'x', pattern: '  ' }], [{ category: 'x', pattern: new RegExp('') }], [{ category: 'x', pattern: 42 }], [null]]) {
    assert.throws(() => guard.effectiveExclusions(bad), /\[api-guard\]/, JSON.stringify(bad));
  }
});

test('add-only: the framework list cannot be mutated, and the guard does not depend on it after load', () => {
  assert.ok(Object.isFrozen(FRAMEWORK_EXCLUSIONS));
  assert.throws(() => { FRAMEWORK_EXCLUSIONS.pop(); }, TypeError);
  assert.throws(() => { FRAMEWORK_EXCLUSIONS[0].patterns.length = 0; }, TypeError);
  assert.throws(() => { FRAMEWORK_EXCLUSIONS[0].patterns[0] = /never-matches/; }, TypeError);
  assert.throws(() => { FRAMEWORK_EXCLUSIONS[0].patterns[0].compile('never-matches'); }, TypeError);
  assert.ok(guard.matchExclusion(['api/Email/Send'], []), 'still blocked after the attempts above');
});

test('add-only: a project RegExp with the g or y flag cannot open gate 3 through lastIndex', () => {
  const project = [{ category: 'internal-systems', pattern: /bridge/gy }];
  // With a shared stateful /g regex the second test() on the same input would miss.
  for (let i = 0; i < 3; i += 1) {
    assert.ok(guard.matchExclusion(['bridge/x'], project), `call ${i + 1}`);
  }
});

// --- Gate 4 helper -------------------------------------------------------------------------

test('pickOwnRecord: exactly one match is returned, none is null, more than one throws', () => {
  const rows = [{ name: 'QA-API-ITEM' }, { name: 'Real customer' }, { name: 'QA-API-ITEM-2' }];
  const nameOf = (r) => r.name;
  assert.deepEqual(guard.pickOwnRecord(rows, nameOf, 'QA-API-ITEM', PREFIX), { name: 'QA-API-ITEM' });
  assert.equal(guard.pickOwnRecord(rows, nameOf, 'QA-API-OTHER', PREFIX), null);
  assert.throws(() => guard.pickOwnRecord([...rows, { name: 'QA-API-ITEM' }], nameOf, 'QA-API-ITEM', PREFIX), /2 records are named "QA-API-ITEM"/);
  assert.throws(() => guard.pickOwnRecord(rows, nameOf, 'Real customer', PREFIX), /does not carry the test prefix/);
  assert.throws(() => guard.pickOwnRecord(rows, nameOf, 'QA-API-ITEM', ''), /needs the test record prefix/);
});

// --- Catalog validation ----------------------------------------------------------------------

test('validateCatalogs: a clean catalog pair has no problems', () => {
  const problems = guard.validateCatalogs({ readCatalog: READS, writeCatalog: [approved()], projectExclusions: [], recordPrefix: PREFIX });
  assert.deepEqual(problems, []);
});

test('validateCatalogs: the shipped empty write catalog is valid', () => {
  assert.deepEqual(guard.validateCatalogs({ readCatalog: READS, writeCatalog: [], projectExclusions: [], recordPrefix: PREFIX }), []);
});

test('validateCatalogs: reports duplicates, bad methods, pending approvals, excluded and overlapping entries', () => {
  const problems = guard.validateCatalogs({
    readCatalog: [...READS, { id: 'status', method: 'GET', path: 'api/x' }, { id: 'r-put', method: 'PUT', path: 'api/items/Edit' }],
    writeCatalog: [
      approved(),
      approved({ id: 'pending', approval: { by: 'QA lead' } }),
      approved({ id: 'mailer', path: 'api/Mail/Send' }),
      approved({ id: 'recorded-no', path: 'api/Mail/Send', scope: 'forbidden', approval: undefined }),
    ],
    projectExclusions: [{ category: 'x', pattern: 'y', remove: true }],
    recordPrefix: '',
  });
  const text = problems.join('\n');
  assert.match(text, /duplicate id "status"/);
  assert.match(text, /read "r-put": method must be GET or POST/);
  assert.match(text, /write "pending": approval\.date/);
  assert.match(text, /write "mailer" matches the framework exclusion "notifications"/);
  assert.match(text, /write "item-edit" is also in the read catalog/);
  assert.match(text, /add-only/);
  assert.match(text, /TEST_RECORD_PREFIX is empty/);
  assert.doesNotMatch(text, /recorded-no/, 'a forbidden entry is a recorded decision, not a problem');
});

// --- Response contract helpers -----------------------------------------------------------------

test('isJsonContentType: JSON media types only - the HTML page of a single-page app is not an API response', () => {
  for (const ct of ['application/json', 'application/json; charset=utf-8', 'Application/JSON', 'application/problem+json', 'application/vnd.api+json']) {
    assert.equal(guard.isJsonContentType(ct), true, ct);
  }
  for (const ct of ['text/html; charset=utf-8', 'text/plain', '', undefined, 'application/jsonx', 'text/json-ish']) {
    assert.equal(guard.isJsonContentType(ct), false, String(ct));
  }
});

test('joinUrl keeps the base path and avoids double slashes', () => {
  assert.equal(guard.joinUrl('https://h/app/', '/api/x'), 'https://h/app/api/x');
  assert.equal(guard.joinUrl('https://h', 'api/x'), 'https://h/api/x');
});
