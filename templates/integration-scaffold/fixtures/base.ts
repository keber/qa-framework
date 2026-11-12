/**
 * base.ts - Playwright fixtures of the API test project.
 *
 *   api        authenticated client. read(): read catalog only. write(): the four
 *              write gates (closed unless the run is `npm run test:write`).
 *   anonymous  client WITHOUT a session, to check that the API refuses it.
 *
 * Both skip the test with a clear message when QA_BASE_URL is not set, so a fresh
 * scaffold never calls anything real. `api` FAILS (it does not skip) when no session
 * is available: a silently skipped authenticated suite looks green and proves nothing.
 *
 * Every decision is made by scripts/api-guard.js before a request is built; a
 * rejected call throws and sends nothing. Each sent call attaches a summary to the
 * report: endpoint, method, path template, status, time, size and the NAMES of the
 * top-level keys. Never cookies, headers, tokens or field values
 * (qa/00-standards/write-safety-policy.md, section 7).
 *
 * Auth follows global-setup.ts: QA_API_TOKEN is sent as `Authorization: Bearer`;
 * otherwise the storageState written by the browser login is used.
 */

import { test as base, expect, request as pwRequest, type APIRequestContext, type TestInfo } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { READ_CATALOG } from './read-catalog';
import { WRITE_CATALOG, TEST_RECORD_PREFIX } from './write-catalog';
import { PROJECT_EXCLUSIONS } from './project-exclusions';

// Plain CommonJS so the guard is testable with `node --test`, without a TypeScript
// toolchain (same approach as the e2e scaffold's scripts/).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const guard = require('../scripts/api-guard.js');

export { expect };

export const AUTH_FILE = path.join(__dirname, '..', '.auth', 'api-session.json');
const MANIFEST_FILE = path.join(__dirname, '..', '..', '..', 'qa-framework.config.json');

export type Endpoint = string | { method: string; path: string };

export type ApiResponse = {
  /** Catalog id of the endpoint. */
  endpoint: string;
  status: number;
  ms: number;
  contentType: string;
  isJson: boolean;
  bytes: number;
  /** Parsed body, only when the response is JSON and parses. */
  json?: unknown;
  /** First 2000 characters of a non-JSON body (for example an HTML page). Never attached. */
  text?: string;
  /** Response headers (lower-case names). Never attached. */
  headers: Record<string, string>;
};

/** What the client needs from a request context. Tests may pass a fake to prove nothing is sent. */
export type Transport = Pick<APIRequestContext, 'fetch'>;

type ReadOptions = {
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean>;
  /** POST queries only; replaces the catalog body. */
  body?: Record<string, unknown>;
};

type WriteOptions = {
  /** Exact name of the record this test created and targets (gate 4). */
  testRecord: string;
  body?: unknown;
  params?: Record<string, string | number>;
  query?: Record<string, string | number | boolean>;
};

function readManifest(): unknown {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  } catch {
    return undefined; // the environment check then fails closed for writes
  }
}

export class ApiClient {
  constructor(
    private readonly transport: Transport,
    private readonly baseUrl: string,
    private readonly info?: TestInfo,
  ) {}

  /** Calls an endpoint of the read catalog. Anything else throws before sending. */
  async read(endpoint: Endpoint, options: ReadOptions = {}): Promise<ApiResponse> {
    const decision = guard.assertRead(
      { endpoint, params: options.params },
      { readCatalog: READ_CATALOG, writeCatalog: WRITE_CATALOG },
    );
    if (decision.method === 'GET' && options.body !== undefined) {
      throw new Error(`[api-guard] read-catalog: ${decision.entry.id} is a GET; it takes no body. Nothing was sent.`);
    }
    const body = decision.method === 'POST' ? options.body ?? decision.entry.body ?? {} : undefined;
    return this.send(decision, body, options.query);
  }

  /** Writes through the four gates of the write-safety policy. Any failing gate throws before sending. */
  async write(endpoint: Endpoint, options: WriteOptions): Promise<ApiResponse> {
    const decision = guard.assertWrite(
      { endpoint, params: options.params, testRecord: options.testRecord },
      {
        env: process.env,
        writeCatalog: WRITE_CATALOG,
        projectExclusions: PROJECT_EXCLUSIONS,
        recordPrefix: TEST_RECORD_PREFIX,
        baseUrl: this.baseUrl,
        manifest: readManifest(),
      },
    );
    return this.send(decision, options.body, options.query);
  }

  private async send(
    decision: { entry: { id: string }; method: string; templatePath: string; path: string },
    body: unknown,
    query?: ReadOptions['query'],
  ): Promise<ApiResponse> {
    const started = Date.now();
    // maxRedirects 0: a redirect to a login page must not pass for a valid response.
    const response = await this.transport.fetch(guard.joinUrl(this.baseUrl, decision.path), {
      method: decision.method,
      data: body,
      params: query,
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    const ms = Date.now() - started;
    const buffer = await response.body();
    const headers = response.headers();
    const contentType = headers['content-type'] ?? '';
    const isJson = guard.isJsonContentType(contentType);
    let json: unknown;
    if (isJson) {
      try {
        json = JSON.parse(buffer.toString('utf-8'));
      } catch {
        json = undefined;
      }
    }
    await this.info?.attach(`call-${decision.entry.id}`, {
      contentType: 'application/json',
      body: JSON.stringify({
        endpoint: decision.entry.id,
        method: decision.method,
        path: decision.templatePath,
        status: response.status(),
        ms,
        contentType,
        bytes: buffer.length,
        keys: json && typeof json === 'object' ? Object.keys(json as object) : [],
      }),
    });
    return {
      endpoint: decision.entry.id,
      status: response.status(),
      ms,
      contentType,
      isJson,
      bytes: buffer.length,
      json,
      text: json === undefined ? buffer.toString('utf-8').slice(0, 2000) : undefined,
      headers,
    };
  }
}

/** QA_BASE_URL, or skips the current test with a message saying how to enable it. */
function baseUrlOrSkip(testInfo: TestInfo): string {
  const baseUrl = (process.env.QA_BASE_URL ?? '').trim();
  testInfo.skip(
    !baseUrl,
    'QA_BASE_URL is not set: this test calls the API and is skipped. Set QA_BASE_URL in .env to run it against your QA environment.',
  );
  return baseUrl;
}

function hasStoredSession(): boolean {
  try {
    const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    return (Array.isArray(state.cookies) && state.cookies.length > 0) || (Array.isArray(state.origins) && state.origins.length > 0);
  } catch {
    return false;
  }
}

/** Context options for an authenticated client, following global-setup.ts. */
export function authenticatedContextOptions(baseUrl: string): Parameters<typeof pwRequest.newContext>[0] {
  const token = process.env.QA_API_TOKEN;
  if (token) return { baseURL: baseUrl, extraHTTPHeaders: { Authorization: `Bearer ${token}` } };
  if (hasStoredSession()) return { baseURL: baseUrl, storageState: AUTH_FILE };
  throw new Error(
    '[api] No authenticated session. Set QA_API_TOKEN, or QA_USER_EMAIL and QA_USER_PASSWORD so that ' +
      'global-setup.ts logs in once per run (see README.md). Tests using `api` fail instead of skipping, ' +
      'so a missing session is never reported as green.',
  );
}

/** Authenticated client outside a test body (for example cleanup in afterAll). Call `dispose()` when done. */
export async function authenticatedClient(info?: TestInfo): Promise<{ client: ApiClient; dispose: () => Promise<void> }> {
  const baseUrl = (process.env.QA_BASE_URL ?? '').trim();
  if (!baseUrl) throw new Error('[api] QA_BASE_URL is not set.');
  const ctx = await pwRequest.newContext(authenticatedContextOptions(baseUrl));
  return { client: new ApiClient(ctx, baseUrl, info), dispose: () => ctx.dispose() };
}

type Fixtures = { api: ApiClient; anonymous: ApiClient };

export const test = base.extend<Fixtures>({
  api: async ({}, use, testInfo) => {
    const baseUrl = baseUrlOrSkip(testInfo);
    const ctx = await pwRequest.newContext(authenticatedContextOptions(baseUrl));
    await use(new ApiClient(ctx, baseUrl, testInfo));
    await ctx.dispose();
  },
  anonymous: async ({}, use, testInfo) => {
    const baseUrl = baseUrlOrSkip(testInfo);
    // No storageState and no token: a fresh context carries no session.
    const ctx = await pwRequest.newContext({ baseURL: baseUrl });
    await use(new ApiClient(ctx, baseUrl, testInfo));
    await ctx.dispose();
  },
});

/** Re-exported for write tests (gate 4): exactly one record with this name, or null; more than one throws. */
export function pickOwnRecord<T>(rows: T[], nameOf: (row: T) => unknown, exactName: string): T | null {
  return guard.pickOwnRecord(rows, nameOf, exactName, TEST_RECORD_PREFIX);
}
