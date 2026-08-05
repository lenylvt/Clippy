const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization, X-Clippy-Internal';

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (origin.startsWith('chrome-extension://')) return true;
  if (origin.endsWith('.workers.dev')) return true;
  if (origin.startsWith('http://localhost:') || origin === 'http://localhost') return true;
  return false;
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin');
  const allowOrigin = isAllowedOrigin(origin) ? origin! : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function withCors(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse(request: Request, data: unknown, status = 200) {
  return withCors(
    request,
    Response.json(data, {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

export function textResponse(request: Request, body: string, contentType: string, status = 200) {
  return withCors(request, new Response(body, { status, headers: { 'Content-Type': contentType } }));
}

export function optionsResponse(request: Request) {
  return withCors(request, new Response(null, { status: 204 }));
}

export function getOrigin(request: Request) {
  return new URL(request.url).origin;
}

export function createId() {
  return crypto.randomUUID();
}

export function sanitizeR2KeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}
