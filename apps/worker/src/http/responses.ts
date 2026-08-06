import { withCors } from './cors';

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
