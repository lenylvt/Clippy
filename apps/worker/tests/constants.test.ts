import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CLIP_TTL_MS,
  CONTAINER_PORT,
  CONTAINER_ROLLOUT_GRACE_S,
  JOB_TTL_MS,
  MAX_CONTAINER_SLOTS,
  JOB_STAGES,
  OTP_FROM_EMAIL,
  clipSlotName,
} from '../src/constants';
import { requireContainerSecret } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const wranglerPath = join(here, '../wrangler.jsonc');

describe('pipeline constants', () => {
  it('cap concurrent containers', () => {
    expect(MAX_CONTAINER_SLOTS).toBe(4);
  });

  it('aligne max_instances wrangler sur MAX_CONTAINER_SLOTS', () => {
    const raw = readFileSync(wranglerPath, 'utf8');
    // Strip // line comments for a cheap parse of the max_instances literal.
    const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
    const match = /"max_instances"\s*:\s*(\d+)/.exec(stripped);
    expect(match?.[1]).toBe(String(MAX_CONTAINER_SLOTS));
  });

  it('aligne rollout_active_grace_period sur CONTAINER_ROLLOUT_GRACE_S', () => {
    const raw = readFileSync(wranglerPath, 'utf8');
    const stripped = raw.replace(/^\s*\/\/.*$/gm, '');
    const match = /"rollout_active_grace_period"\s*:\s*(\d+)/.exec(stripped);
    expect(match?.[1]).toBe(String(CONTAINER_ROLLOUT_GRACE_S));
    expect(CONTAINER_ROLLOUT_GRACE_S).toBeGreaterThanOrEqual(11 * 60);
  });

  it('aligne sender email sur wrangler allowlist', () => {
    const raw = readFileSync(wranglerPath, 'utf8');
    expect(raw).toContain(`"${OTP_FROM_EMAIL}"`);
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
    expect(clipSlotName(MAX_CONTAINER_SLOTS - 1)).toBe(`slot-${MAX_CONTAINER_SLOTS - 1}`);
    expect(OTP_FROM_EMAIL).toBe('clippy@lenylvt.cc');
    expect(CONTAINER_PORT).toBe(8080);
    expect(CLIP_TTL_MS).toBe(JOB_TTL_MS);
  });

  it('rejette slots hors bornes', () => {
    expect(() => clipSlotName(-1)).toThrow(/invalid_clip_slot/);
    expect(() => clipSlotName(MAX_CONTAINER_SLOTS)).toThrow(/invalid_clip_slot/);
    expect(() => clipSlotName(1.5)).toThrow(/invalid_clip_slot/);
  });

  it('requireContainerSecret fail-fast si absent', () => {
    expect(() => requireContainerSecret({ CONTAINER_SECRET: '' })).toThrow(
      /CONTAINER_SECRET_not_configured/,
    );
    expect(requireContainerSecret({ CONTAINER_SECRET: 's3cret' })).toBe('s3cret');
  });
});
