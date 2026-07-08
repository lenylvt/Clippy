/** @param {{ streamId?: string; start?: number; end?: number }} payload */
function validateClipRecordPayload(payload) {
  if (!payload?.streamId) {
    return { ok: false, error: 'missing_stream_id' };
  }

  if (!Number.isFinite(payload.start) || !Number.isFinite(payload.end)) {
    return { ok: false, error: 'invalid_clip' };
  }

  return { ok: true };
}

globalThis.validateClipRecordPayload = validateClipRecordPayload;
