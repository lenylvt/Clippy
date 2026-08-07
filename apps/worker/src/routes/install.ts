/**
 * Install page helpers + redirect to the Kumo React SPA under /install/.
 * Static assets are built from apps/install into apps/worker/public/install.
 */

import type { Env } from '../types';

export const INSTALL_PATH = '/install';
export const EXTENSION_ZIP_R2_KEY = 'releases/clippy-extension.zip';

export function extensionVersion(env: Pick<Env, 'EXTENSION_VERSION'>): string {
  const v = env.EXTENSION_VERSION?.trim();
  return v && v.length > 0 ? v : '0.0.0';
}

export function publicOrigin(env: Pick<Env, 'PUBLIC_ORIGIN'>, requestUrl: string): string {
  const fromEnv = env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  return new URL(requestUrl).origin;
}

/** Redirect /install → /install/ (SPA assets). Preserves query + hash is client-side. */
export function handleInstall(request: Request): Response {
  const url = new URL(request.url);
  if (url.pathname === '/install/') {
    // Should be served by assets; fallback message if assets missing.
    return new Response('Install app missing — run apps/install build.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  url.pathname = '/install/';
  return Response.redirect(url.toString(), 302);
}
