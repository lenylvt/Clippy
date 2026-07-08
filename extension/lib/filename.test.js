import { describe, expect, it } from 'vitest';
import './filename.js';

const { sanitizeFilename } = globalThis;

describe('sanitizeFilename', () => {
  it('removes invalid characters', () => {
    expect(sanitizeFilename('Test: video / name')).toBe('Test video name');
  });

  it('removes apostrophes and repeated dots', () => {
    expect(sanitizeFilename("J'ai test..name")).toBe('Jai test.name');
  });
});
