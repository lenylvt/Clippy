const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const ALLOWED_HEADERS =
  'Content-Type, Authorization, X-Clippy-Internal, Range';

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
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length, Content-Type',
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

export function optionsResponse(request: Request) {
  return withCors(request, new Response(null, { status: 204 }));
}

export function getOrigin(request: Request) {
  return new URL(request.url).origin;
}
