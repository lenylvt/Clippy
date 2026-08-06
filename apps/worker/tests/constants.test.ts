import { describe, expect, it } from 'vitest';
import {
  MAX_CONTAINER_SLOTS,
  JOB_STAGES,
  OTP_FROM_EMAIL,
  clipSlotName,
} from '../src/constants';

describe('pipeline constants', () => {
  it('cap concurrent containers', () => {
    expect(MAX_CONTAINER_SLOTS).toBe(4);
  });

  it('expose les stages UI', () => {
    expect(JOB_STAGES).toContain('queued');
    expect(JOB_STAGES).toContain('preparing');
    expect(JOB_STAGES).toContain('downloading');
    expect(JOB_STAGES).toContain('cropping');
    expect(JOB_STAGES).toContain('uploading');
    expect(JOB_STAGES).toContain('done');
  });

  it('names slots and sender email', () => {
    expect(clipSlotName(0)).toBe('slot-0');
    expect(OTP_FROM_EMAIL).toBe('clippy@lenylvt.cc');
  });
});
