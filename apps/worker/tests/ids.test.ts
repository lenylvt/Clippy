import { describe, expect, it } from 'vitest';
import { createId, isUuid, sanitizeR2KeyPart } from '../src/http/ids';

describe('sanitizeR2KeyPart', () => {
  it('remplace les caractères non sûrs et tronque', () => {
    expect(sanitizeR2KeyPart('ab/cd ef')).toBe('ab_cd_ef');
    expect(sanitizeR2KeyPart('a'.repeat(200)).length).toBe(120);
  });

  it('trim puis collapse underscores', () => {
    expect(sanitizeR2KeyPart('  hello___world  ')).toBe('hello_world');
  });

  it('garde unknown pour vide / . / ..', () => {
    expect(sanitizeR2KeyPart('')).toBe('unknown');
    expect(sanitizeR2KeyPart('   ')).toBe('unknown');
    expect(sanitizeR2KeyPart('.')).toBe('unknown');
    expect(sanitizeR2KeyPart('..')).toBe('unknown');
  });

  it('neutralise / et ne produit pas de segment vide seul', () => {
    expect(sanitizeR2KeyPart('../x')).toBe('.._x');
    expect(sanitizeR2KeyPart('vid/../../../etc')).toBe('vid_.._.._.._etc');
    expect(sanitizeR2KeyPart('!!!')).toBe('_');
  });
});

describe('createId / isUuid', () => {
  it('retourne un UUID valide', () => {
    const id = createId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(isUuid(id)).toBe(true);
  });

  it('rejette les non-UUID', () => {
    expect(isUuid('nope')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});
