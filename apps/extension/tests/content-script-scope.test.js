/**
 * Content scripts MV3 share one classic-script scope.
 * Top-level const/let/function/class with the same name across files → SyntaxError.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = require(join(root, 'manifest.json'));

const DECL =
  /^(?:export\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const DESTR = /^(?:const|let|var)\s*\{([^}]+)\}/gm;

/**
 * @param {string[]} files relative to extension root
 * @returns {Map<string, string[]>}
 */
function collectBindings(files) {
  /** @type {Map<string, string[]>} */
  const byName = new Map();
  for (const rel of files) {
    const text = readFileSync(join(root, rel), 'utf8');
    for (const m of text.matchAll(DECL)) {
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      if (text.slice(lineStart, m.index).length) continue;
      const name = m[1];
      const list = byName.get(name) ?? [];
      list.push(rel);
      byName.set(name, list);
    }
    for (const m of text.matchAll(DESTR)) {
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      if (text.slice(lineStart, m.index).length) continue;
      for (const part of m[1].split(',')) {
        const name = part.trim().split(':')[0].trim().split('=')[0].trim();
        if (!name) continue;
        const list = byName.get(name) ?? [];
        list.push(`${rel} (destr)`);
        byName.set(name, list);
      }
    }
  }
  return byName;
}

/**
 * @param {Map<string, string[]>} byName
 */
function duplicates(byName) {
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const [name, files] of byName) {
    const uniq = [...new Set(files)];
    if (uniq.length > 1) out[name] = uniq;
  }
  return out;
}

describe('content script shared scope', () => {
  it('aucune redeclaration top-level entre fichiers injectés', () => {
    const files = manifest.content_scripts[0].js;
    const dups = duplicates(collectBindings(files));
    expect(dups).toEqual({});
  });

  it('options.html : pas de collision entre scripts classiques', () => {
    const html = readFileSync(join(root, 'options/options.html'), 'utf8');
    const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => {
      const src = m[1];
      return src.startsWith('../') ? src.slice(3) : `options/${src}`;
    });
    const dups = duplicates(collectBindings(scripts));
    expect(dups).toEqual({});
  });

  it('injecte lib/title.js (cleanYoutubeTitle requis par content)', () => {
    const files = manifest.content_scripts[0].js;
    expect(files).toContain('lib/title.js');
    expect(files.indexOf('lib/title.js')).toBeLessThan(files.indexOf('content/content.js'));
    expect(files.indexOf('lib/title.js')).toBeLessThan(files.indexOf('content/clip-client.js'));
  });
});
