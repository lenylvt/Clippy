import { describe, expect, it } from 'vitest';
import { MAX_CONTAINER_SLOTS, JOB_STAGES } from '../src/constants';

describe('pipeline constants', () => {
  it('cap concurrent containers', () => {
    expect(MAX_CONTAINER_SLOTS).toBe(4);
  });

  it('expose les stages UI', () => {
    expect(JOB_STAGES).toContain('queued');
    expect(JOB_STAGES).toContain('downloading');
    expect(JOB_STAGES).toContain('cropping');
    expect(JOB_STAGES).toContain('uploading');
    expect(JOB_STAGES).toContain('done');
  });
});
