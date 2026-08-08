import { describe, expect, it } from 'vitest';
import { canSubmitAdminSecret } from '../src/pages/LoginPage';

describe('canSubmitAdminSecret', () => {
  it('enables Continue for short secrets like Leny1500', () => {
    expect(canSubmitAdminSecret('Leny1500', false)).toBe(true);
  });

  it('disables Continue when empty or only whitespace', () => {
    expect(canSubmitAdminSecret('', false)).toBe(false);
    expect(canSubmitAdminSecret('   ', false)).toBe(false);
  });

  it('disables Continue while loading', () => {
    expect(canSubmitAdminSecret('Leny1500', true)).toBe(false);
  });
});
