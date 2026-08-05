import { describe, expect, it } from 'vitest';
import { clipSlotName, MAX_CONTAINER_SLOTS } from '../src/constants';

describe('clipSlotName', () => {
  it('names Durable Object slots consistently', () => {
    expect(clipSlotName(0)).toBe('slot-0');
    expect(clipSlotName(3)).toBe('slot-3');
  });

  it('covers every configured container slot', () => {
    const names = Array.from({ length: MAX_CONTAINER_SLOTS }, (_, i) => clipSlotName(i));
    expect(names).toEqual(['slot-0', 'slot-1', 'slot-2', 'slot-3']);
  });
});
