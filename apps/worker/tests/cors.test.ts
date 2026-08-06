import { describe, expect, it } from 'vitest';
import {
  corsHeaders,
  isAllowedOrigin,
  optionsResponse,
  parseRequestOrigin,
  withCors,
  workerOrigin,
  type CorsEnv,
} from '../src/http/cors';
import { jsonResponse } from '../src/http/responses';

/** Valid Chrome extension id shape: 32 chars in a–p. */
const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop';

const ENV: CorsEnv = {
  PUBLIC_ORIGINS: 'https://clippy.example.com, https://clippy.runtimelayer.workers.dev',
  EXTENSION_ID: EXT_ID,
};

function req(origin?: string | null, url = 'https://api.clippy.test/v1') {
  const headers = new Headers();
  if (origin !== undefined && origin !== null) headers.set('Origin', origin);
  return new Request(url, { headers });
}

describe('parseRequestOrigin', () => {
  it('canonise une Origin valide', () => {
    expect(parseRequestOrigin('https://clippy.example.com')).toBe('https://clippy.example.com');
    expect(parseRequestOrigin('http://localhost:5173/')).toBe('http://localhost:5173');
  });

  it('rejette null / invalide / littéral "null"', () => {
    expect(parseRequestOrigin(null)).toBeNull();
    expect(parseRequestOrigin('null')).toBeNull();
    expect(parseRequestOrigin('')).toBeNull();
    expect(parseRequestOrigin('not-a-url')).toBeNull();
  });
});

describe('isAllowedOrigin', () => {
  it('autorise PUBLIC_ORIGINS exactes', () => {
    expect(isAllowedOrigin('https://clippy.example.com', ENV)).toBe(true);
    expect(isAllowedOrigin('https://clippy.runtimelayer.workers.dev', ENV)).toBe(true);
  });

  it('autorise uniquement l’EXTENSION_ID configuré', () => {
    expect(isAllowedOrigin(`chrome-extension://${EXT_ID}`, ENV)).toBe(true);
    expect(isAllowedOrigin('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ENV)).toBe(false);
    expect(isAllowedOrigin('chrome-extension://not-a-valid-id', ENV)).toBe(false);
  });

  it('parse chrome-extension malgré origin opaque URL', () => {
    expect(parseRequestOrigin(`chrome-extension://${EXT_ID}`)).toBe(`chrome-extension://${EXT_ID}`);
  });

  it('autorise localhost et 127.0.0.1 (http/https, tout port)', () => {
    expect(isAllowedOrigin('http://localhost', ENV)).toBe(true);
    expect(isAllowedOrigin('http://localhost:8787', ENV)).toBe(true);
    expect(isAllowedOrigin('https://localhost:3000', ENV)).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173', ENV)).toBe(true);
    expect(isAllowedOrigin('https://127.0.0.1', ENV)).toBe(true);
  });

  it('refuse *.workers.dev global et origines hors allowlist', () => {
    expect(isAllowedOrigin('https://attacker.workers.dev', ENV)).toBe(false);
    expect(isAllowedOrigin('https://evil.example.com', ENV)).toBe(false);
    expect(isAllowedOrigin('https://clippy.example.com.evil.com', ENV)).toBe(false);
    expect(isAllowedOrigin(null, ENV)).toBe(false);
    expect(isAllowedOrigin('null', ENV)).toBe(false);
  });

  it('sans EXTENSION_ID / PUBLIC_ORIGINS : seul localhost passe', () => {
    const empty: CorsEnv = {};
    expect(isAllowedOrigin('http://localhost:1', empty)).toBe(true);
    expect(isAllowedOrigin('https://clippy.example.com', empty)).toBe(false);
    expect(isAllowedOrigin(`chrome-extension://${EXT_ID}`, empty)).toBe(false);
  });
});

describe('corsHeaders / withCors', () => {
  it('omet tous les headers ACA* si origine refusée (jamais ACAO "null")', () => {
    const headers = corsHeaders(req('https://evil.example.com'), ENV);
    expect(headers).toBeNull();

    const res = withCors(req('https://evil.example.com'), ENV, new Response('x'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Methods')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Headers')).toBeNull();
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('null');
    expect(res.headers.get('Vary')).toContain('Origin');
  });

  it('omet ACA* si pas d’Origin (clients natifs / curl)', () => {
    const res = withCors(req(undefined), ENV, new Response('ok'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('reflète l’origine autorisée et n’expose pas X-Clippy-Internal', () => {
    const headers = corsHeaders(req('https://clippy.example.com'), ENV)!;
    expect(headers.get('Access-Control-Allow-Origin')).toBe('https://clippy.example.com');
    expect(headers.get('Access-Control-Allow-Methods')).toBe(
      'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
    );
    expect(headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization, Range');
    expect(headers.get('Access-Control-Allow-Headers')).not.toContain('X-Clippy-Internal');
    expect(headers.get('Access-Control-Allow-Methods')).toContain('HEAD');
    expect(headers.get('Access-Control-Allow-Methods')).not.toContain('PUT');
  });

  it('merge Vary existant', () => {
    const base = new Response('body', { headers: { Vary: 'Accept-Encoding' } });
    const res = withCors(req('https://clippy.example.com'), ENV, base);
    const vary = res.headers.get('Vary')!;
    expect(vary).toContain('Accept-Encoding');
    expect(vary).toContain('Origin');
  });
});

describe('optionsResponse', () => {
  it('204 + CORS si allow ; 204 sans ACAO si deny', () => {
    const ok = optionsResponse(req('http://localhost:8787'), ENV);
    expect(ok.status).toBe(204);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8787');

    const deny = optionsResponse(req('https://attacker.workers.dev'), ENV);
    expect(deny.status).toBe(204);
    expect(deny.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('workerOrigin / jsonResponse', () => {
  it('workerOrigin lit request.url, pas le header Origin', () => {
    const request = req('https://clippy.example.com', 'https://worker.example/path');
    expect(workerOrigin(request)).toBe('https://worker.example');
  });

  it('jsonResponse applique CORS allow', async () => {
    const res = jsonResponse(req('https://clippy.example.com'), ENV, { ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://clippy.example.com');
    expect(await res.json()).toEqual({ ok: true });
  });
});
