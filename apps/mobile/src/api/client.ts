import Constants from 'expo-constants';
import type { ApiEnvelope, ApiErrorCode, ApiErrorKind } from './types';

export type HttpMethod = 'GET' | 'POST' | 'DELETE' | 'PATCH' | 'PUT';

export type ApiQuery = Record<string, string | number | boolean | undefined | null>;

export type ApiOptions = {
  method?: HttpMethod;
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
  query?: ApiQuery;
  /** Request timeout in ms (default 20s). */
  timeoutMs?: number;
  /** Extra retries after the first attempt (default 2 → 3 attempts). */
  retries?: number;
  /** Coalesce identical in-flight GETs (default true for GET without custom signal). */
  dedupe?: boolean;
  headers?: Record<string, string>;
  /** Optional Idempotency-Key for sensitive POSTs. */
  idempotencyKey?: string;
};

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

type ExpoExtra = { apiUrl?: string } | undefined;

type UnauthorizedHandler = (error: ApiError) => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Wire once from auth — called on real HTTP 401 only. */
export function setOnUnauthorized(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: ApiErrorCode;
  readonly body: unknown;
  readonly retryAfterMs: number | null;
  override readonly cause?: unknown;

  constructor(opts: {
    message?: string;
    kind: ApiErrorKind;
    status?: number | null;
    code: ApiErrorCode;
    body?: unknown;
    cause?: unknown;
    retryAfterMs?: number | null;
  }) {
    super(opts.message || opts.code);
    this.name = 'ApiError';
    this.kind = opts.kind;
    this.status = opts.status ?? null;
    this.code = opts.code;
    this.body = opts.body ?? null;
    this.retryAfterMs = opts.retryAfterMs ?? null;
    this.cause = opts.cause;
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.code === 'unauthorized';
  }

  get isNetwork(): boolean {
    return this.kind === 'network' || this.kind === 'timeout';
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

function readExtra(): ExpoExtra {
  const expoConfig = Constants.expoConfig as { extra?: ExpoExtra } | null | undefined;
  const manifest = (Constants as { manifest?: { extra?: ExpoExtra } | null }).manifest;
  return expoConfig?.extra ?? manifest?.extra;
}

function resolveApiUrl(): string {
  const extra = readExtra();
  const raw = typeof extra?.apiUrl === 'string' ? extra.apiUrl.trim() : '';
  if (!raw) {
    const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
    if (isDev) {
      throw new ApiError({
        kind: 'api',
        code: 'missing_api_url',
        message: 'missing_api_url',
      });
    }
    return 'https://clippy.runtimelayer.workers.dev';
  }
  const base = normalizeBaseUrl(raw);
  const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
  if (!isDev && !/^https:\/\//i.test(base)) {
    throw new ApiError({
      kind: 'api',
      code: 'missing_api_url',
      message: 'api_url_must_be_https',
    });
  }
  return base;
}

export const API_URL = resolveApiUrl();

function appVersion(): string {
  return Constants.expoConfig?.version ?? '0.1.0';
}

function buildUrl(path: string, query?: ApiQuery): string {
  if (!path.startsWith('/')) {
    throw new ApiError({ kind: 'api', code: 'invalid_path', message: 'path_must_start_with_slash' });
  }
  const url = new URL(`${API_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (typeof value === 'boolean') {
        url.searchParams.set(key, value ? '1' : '0');
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'AbortError' || err.name === 'TimeoutError';
}

function mergeSignals(
  timeoutMs: number,
  userSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  if (typeof AbortSignal.timeout === 'function' && typeof AbortSignal.any === 'function') {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (!userSignal) {
      return { signal: timeoutSignal, cleanup: () => {} };
    }
    return { signal: AbortSignal.any([timeoutSignal, userSignal]), cleanup: () => {} };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException('TimeoutError', 'TimeoutError'));
    }
  }, timeoutMs);

  const onUserAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(userSignal?.reason ?? new DOMException('Aborted', 'AbortError'));
    }
  };

  if (userSignal) {
    if (userSignal.aborted) onUserAbort();
    else userSignal.addEventListener('abort', onUserAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      userSignal?.removeEventListener('abort', onUserAbort);
    },
  };
}

function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get('Retry-After');
  if (!raw) return null;
  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(asSeconds * 1000, 60_000);
  }
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    return Math.min(Math.max(0, asDate - Date.now()), 60_000);
  }
  return null;
}

function backoffMs(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs != null) return retryAfterMs;
  const base = Math.min(1000 * 2 ** attempt, 8_000);
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isTransientStatus(status: number): boolean {
  return TRANSIENT_STATUSES.has(status);
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    if (!res.ok) return {};
    throw new ApiError({
      kind: 'parse',
      code: 'invalid_json',
      status: res.status,
      message: 'empty_response',
    });
  }
  const contentType = res.headers.get('content-type') ?? '';
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    if (contentType && !contentType.toLowerCase().includes('application/json')) {
      throw new ApiError({
        kind: 'parse',
        code: 'invalid_json',
        status: res.status,
        message: 'non_json_response',
        cause,
      });
    }
    throw new ApiError({
      kind: 'parse',
      code: 'invalid_json',
      status: res.status,
      message: 'invalid_json',
      cause,
    });
  }
}

function dedupeKey(method: HttpMethod, url: string, token: string | null | undefined): string {
  return `${method}:${url}:${token ?? ''}`;
}

const inflightGets = new Map<string, Promise<unknown>>();

async function apiOnce<T>(opts: ApiOptions, url: string): Promise<T> {
  const method = opts.method ?? 'GET';
  if (opts.body === null) {
    throw new ApiError({ kind: 'api', code: 'invalid_body', message: 'body_null_not_allowed' });
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Clippy-App': 'mobile',
    'X-Clippy-App-Version': appVersion(),
    ...opts.headers,
  };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (typeof opts.token === 'string') {
    headers.Authorization = `Bearer ${opts.token}`;
  }
  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { signal, cleanup } = mergeSignals(timeoutMs, opts.signal);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal,
    });
  } catch (cause) {
    if (opts.signal?.aborted) {
      throw cause instanceof Error ? cause : new DOMException('Aborted', 'AbortError');
    }
    if (isAbortError(cause)) {
      throw new ApiError({
        kind: 'timeout',
        code: 'timeout',
        message: 'timeout',
        cause,
      });
    }
    throw new ApiError({
      kind: 'network',
      code: 'network_error',
      message: 'network_error',
      cause,
    });
  } finally {
    cleanup();
  }

  const data = (await readJson(res)) as T & ApiEnvelope;

  if (!res.ok) {
    const code = (typeof data?.error === 'string' && data.error) || `http_${res.status}`;
    const err = new ApiError({
      kind: 'http',
      status: res.status,
      code,
      body: data,
      message: code,
      retryAfterMs: parseRetryAfterMs(res),
    });
    if (err.isUnauthorized) {
      unauthorizedHandler?.(err);
    }
    throw err;
  }

  if (data?.ok !== true) {
    const code =
      (typeof data?.error === 'string' && data.error) ||
      (data?.ok === false ? 'request_failed' : 'missing_ok');
    throw new ApiError({
      kind: 'api',
      status: res.status,
      code,
      body: data,
      message: code,
    });
  }

  return data;
}

/**
 * Typed Clippy HTTP client: timeout, transient retries (+ Retry-After),
 * AbortSignal, optional GET in-flight dedupe, requires `ok === true`.
 */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const url = buildUrl(path, opts.query);
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const shouldDedupe = (opts.dedupe ?? method === 'GET') && !opts.signal;

  const run = async (): Promise<T> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await apiOnce<T>(opts, url);
      } catch (err) {
        lastError = err;
        if (opts.signal?.aborted || (isAbortError(err) && opts.signal?.aborted)) {
          throw err;
        }

        const apiErr = isApiError(err) ? err : null;
        const status = apiErr?.status;
        const transient =
          Boolean(apiErr?.isNetwork) ||
          (typeof status === 'number' && isTransientStatus(status));

        if (!transient || attempt >= retries) {
          throw err;
        }

        await sleep(backoffMs(attempt, apiErr?.retryAfterMs ?? null), opts.signal);
      }
    }
    throw lastError;
  };

  if (!shouldDedupe) {
    return run();
  }

  const key = dedupeKey(method, url, opts.token);
  const existing = inflightGets.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const pending = run().finally(() => {
    inflightGets.delete(key);
  });
  inflightGets.set(key, pending);
  return pending;
}

/** Test helper — clear GET in-flight map. */
export function __resetApiInflightForTests(): void {
  inflightGets.clear();
}
