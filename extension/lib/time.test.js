import { describe, expect, it } from 'vitest';
import './clip-constants.js';
import './time.js';

const { clamp, formatDuration, isTimeInClip, normalizeClip, parseDuration } = globalThis;

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });
});

describe('parseDuration', () => {
  it('parses mm:ss', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('0:45')).toBe(45);
  });

  it('parses h:mm:ss', () => {
    expect(parseDuration('1:01:01')).toBe(3661);
  });

  it('parses seconds only', () => {
    expect(parseDuration('45')).toBe(45);
  });

  it('rejects invalid values', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('1:60')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
  });
});

describe('normalizeClip', () => {
  it('keeps clip inside video bounds', () => {
    expect(normalizeClip(-10, 80, 600)).toEqual({ start: 0, end: 90 });
    expect(normalizeClip(550, 650, 600)).toEqual({ start: 500, end: 600 });
  });

  it('enforces minimum length', () => {
    expect(normalizeClip(10, 11, 600, 3)).toEqual({ start: 10, end: 13 });
  });
});

describe('isTimeInClip', () => {
  it('detects when playhead is inside clip', () => {
    expect(isTimeInClip(50, 10, 90)).toBe(true);
    expect(isTimeInClip(5, 10, 90)).toBe(false);
    expect(isTimeInClip(95, 10, 90)).toBe(false);
    expect(isTimeInClip(10, 10, 90)).toBe(true);
    expect(isTimeInClip(90, 10, 90)).toBe(true);
  });
});

describe('clamp', () => {
  it('clamps values', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 10)).toBe(0);
  });
});
