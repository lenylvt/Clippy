import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('focus outline', () => {
  it('n’affiche pas de ring focus sur le bouton player ni l’éditeur', () => {
    const css = readFileSync(path.join(root, 'content/styles/content.css'), 'utf8');
    expect(css).toMatch(/\.ytp-clippy-button:focus-visible\s*\{[^}]*outline:\s*none/s);
    expect(css).toMatch(/\.clippy-panel:focus-visible\s*\{[^}]*outline:\s*none/s);
    expect(css).toMatch(/\.clippy-playhead:focus-visible\s*\{[^}]*outline:\s*none/s);
    expect(css).not.toMatch(/outline:\s*2px\s+solid/);
  });
});
