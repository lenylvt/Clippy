/**
 * CORS for browser clients (extension + optional web origins).
 * Native apps and server-to-server calls omit Origin and get no ACA* headers.
 * Auth is Bearer-only (no cookies) — do not add Access-Control-Allow-Credentials.
 */

export type CorsEnv = {
  /** Comma-separated absolute origins (e.g. `https://app.example.com,https://clippy.…workers.dev`). */
  PUBLIC_ORIGINS?: string;
  /** Chrome extension ID → allow `chrome-extension://<id>` only. */
  EXTENSION_ID?: string;
};

const ALLOWED_METHODS = 'GET, HEAD, POST, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization, Range';
const EXPOSE_HEADERS = 'Accept-Ranges, Content-Range, Content-Length, Content-Type';
/** Shorter than 24h so allowlist changes propagate faster. */
const MAX_AGE_SECONDS = '3600';

/** Chrome extension IDs are 32 chars in `a–p`. */
const EXTENSION_ID_RE = /^[a-p]{32}$/;

/** Parse `Origin` header to a canonical origin; reject `null` and invalid values. */
export function parseRequestOrigin(originHeader: string | null): string | null {
  if (!originHeader || originHeader === 'null') return null;
  try {
    const url = new URL(originHeader);
    // `chrome-extension:` is an opaque origin in the URL API (`origin === "null"`).
    if (url.protocol === 'chrome-extension:') {
      const id = url.hostname;
      if (!EXTENSION_ID_RE.test(id)) return null;
      return `chrome-extension://${id}`;
    }
    if (url.origin === 'null') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isDevLocalOrigin(canonicalOrigin: string): boolean {
  try {
    const url = new URL(canonicalOrigin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function configuredOrigins(env: CorsEnv): Set<string> {
  const allowed = new Set<string>();
  for (const part of (env.PUBLIC_ORIGINS ?? '').split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      const origin = new URL(trimmed).origin;
      if (origin !== 'null') allowed.add(origin);
    } catch {
      // skip invalid entries
    }
  }
  const extensionId = env.EXTENSION_ID?.trim();
  if (extensionId && EXTENSION_ID_RE.test(extensionId)) {
    allowed.add(`chrome-extension://${extensionId}`);
  }
  return allowed;
}

export function isAllowedOrigin(originHeader: string | null, env: CorsEnv): boolean {
  const canonical = parseRequestOrigin(originHeader);
  if (!canonical) return false;
  if (isDevLocalOrigin(canonical)) return true;
  return configuredOrigins(env).has(canonical);
}

/** CORS headers for an allowed origin, or `null` when Origin is missing/denied (omit ACA*). */
export function corsHeaders(request: Request, env: CorsEnv): Headers | null {
  const originHeader = request.headers.get('Origin');
  const canonical = parseRequestOrigin(originHeader);
  if (!canonical || !isAllowedOrigin(originHeader, env)) {
    return null;
  }

  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', canonical);
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  headers.set('Access-Control-Expose-Headers', EXPOSE_HEADERS);
  headers.set('Access-Control-Max-Age', MAX_AGE_SECONDS);
  headers.set('Vary', 'Origin');
  return headers;
}

function mergeVary(headers: Headers, value: string) {
  const tokens = new Set(
    (headers.get('Vary') ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  );
  for (const part of value.split(',')) {
    const token = part.trim();
    if (token) tokens.add(token);
  }
  headers.set('Vary', [...tokens].join(', '));
}

export function withCors(request: Request, env: CorsEnv, response: Response) {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(request, env);
  if (cors) {
    cors.forEach((value, key) => {
      if (key.toLowerCase() === 'vary') {
        mergeVary(headers, value);
      } else {
        headers.set(key, value);
      }
    });
  } else {
    // Responses still vary by Origin when denied vs allowed — help caches.
    mergeVary(headers, 'Origin');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function optionsResponse(request: Request, env: CorsEnv) {
  return withCors(request, env, new Response(null, { status: 204 }));
}

/**
 * Absolute origin of the Worker URL (`request.url`), used for public clip/job links.
 * Not the client `Origin` header — see {@link parseRequestOrigin}.
 */
export function workerOrigin(request: Request) {
  return new URL(request.url).origin;
}
