import { describe, expect, it } from 'vitest';
import './record.js';

describe('validateClipRecordPayload', () => {
  it('requires a stream id obtained during the user gesture', () => {
    expect(validateClipRecordPayload({ start: 0, end: 10 })).toEqual({
      ok: false,
      error: 'missing_stream_id',
    });
  });

  it('accepts a valid payload', () => {
    expect(
      validateClipRecordPayload({ streamId: 'abc', start: 0, end: 10 }),
    ).toEqual({ ok: true });
  });
});
