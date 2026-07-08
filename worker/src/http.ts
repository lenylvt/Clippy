const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function withCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse(data: unknown, status = 200) {
  return withCors(
    Response.json(data, {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  );
}

export function textResponse(body: string, contentType: string, status = 200) {
  return withCors(new Response(body, { status, headers: { 'Content-Type': contentType } }));
}

export function optionsResponse() {
  return withCors(new Response(null, { status: 204 }));
}

export function getOrigin(request: Request) {
  return new URL(request.url).origin;
}

export function createClipId() {
  return crypto.randomUUID();
}

export function sanitizeR2KeyPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}
