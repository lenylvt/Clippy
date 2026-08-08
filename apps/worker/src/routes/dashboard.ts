/**
 * Dashboard SPA — static assets under /dashboard/ from apps/dashboard build.
 * Client routes (/dashboard/users, …) fall back to the dashboard directory index via ASSETS.
 */

import type { Env } from '../types';

export const DASHBOARD_PATH = '/dashboard';

export function handleDashboard(request: Request): Response {
  const url = new URL(request.url);
  url.pathname = '/dashboard/';
  return Response.redirect(url.toString(), 302);
}

async function fetchDashboardShell(env: Env, request: Request): Promise<Response> {
  // Prefer directory index (`/dashboard/`) — ASSETS maps it to index.html with 200.
  // Do not forward the original Request object (can confuse asset routing).
  const dirUrl = new URL('/dashboard/', request.url);
  const res = await env.ASSETS!.fetch(dirUrl.toString(), {
    method: 'GET',
    headers: { Accept: 'text/html' },
  });
  if (res.ok) {
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  const indexUrl = new URL('/dashboard/index.html', request.url);
  const indexRes = await env.ASSETS!.fetch(indexUrl.toString(), { method: 'GET' });
  return new Response(indexRes.body, {
    status: indexRes.ok ? 200 : indexRes.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/** Serve dashboard SPA shell for `/dashboard/` and nested client routes. */
export async function handleDashboardSpa(
  request: Request,
  env: Env,
  rawPathname: string,
): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  if (!rawPathname.startsWith('/dashboard/')) return null;

  if (!env.ASSETS) {
    return new Response('Dashboard assets missing', { status: 503 });
  }

  // Static hashed assets under /dashboard/assets/…
  if (rawPathname.startsWith('/dashboard/assets/')) {
    return env.ASSETS.fetch(request);
  }

  // SPA shell for `/dashboard/` and client routes (`/dashboard/users`, …).
  return fetchDashboardShell(env, request);
}
