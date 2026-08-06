import { describe, expect, it } from 'vitest';
import { buildPrivacyHtml, handlePrivacy, PRIVACY_PATH } from '../src/routes/privacy';

describe('privacy page', () => {
  it('expose le chemin /privacy', () => {
    expect(PRIVACY_PATH).toBe('/privacy');
  });

  it('génère une page HTML FR avec les sections clés', () => {
    const html = buildPrivacyHtml();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('lang="fr"');
    expect(html).toContain('Règles de confidentialité');
    expect(html).toContain('clippy@lenylvt.cc');
    expect(html).toContain('48 heures');
    expect(html).toContain('chrome.storage');
    expect(html).toContain('https://clippy.runtimelayer.workers.dev/privacy');
    expect(html).toContain('ne vendons pas');
  });

  it('répond 200 text/html avec cache public', () => {
    const res = handlePrivacy();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
});
