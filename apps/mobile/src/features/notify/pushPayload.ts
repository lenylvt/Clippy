export type JobDonePayload = {
  clipId?: string;
  clipUrl?: string;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

/** Normalize notification `content.data` (object or JSON string). */
export function normalizePushData(data: unknown): Record<string, unknown> | undefined {
  return asRecord(data);
}

/**
 * Extract job_done fields from a background NotificationTaskPayload.
 * Payload is either a NotificationResponse (`actionIdentifier`) or
 * `{ data: { dataString?, ...fields }, notification }`.
 */
export function extractPushDataFromTaskPayload(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const data = payload as Record<string, unknown>;

  if ('actionIdentifier' in data) {
    const notification = data.notification as
      | { request?: { content?: { data?: unknown } } }
      | undefined;
    return normalizePushData(notification?.request?.content?.data);
  }

  const bag = data.data;
  if (bag && typeof bag === 'object') {
    const record = bag as Record<string, unknown>;
    if (typeof record.dataString === 'string') {
      const parsed = normalizePushData(record.dataString);
      if (parsed) return parsed;
    }
    // Fallback: fields may sit directly on `data` (minus dataString).
    const { dataString: _ds, ...rest } = record;
    if (Object.keys(rest).length > 0) return rest;
  }

  return undefined;
}

export function readJobDonePayload(data: Record<string, unknown> | undefined): JobDonePayload | null {
  if (!data || data.type !== 'job_done') return null;
  return {
    clipId: typeof data.clipId === 'string' ? data.clipId : undefined,
    clipUrl: typeof data.clipUrl === 'string' ? data.clipUrl : undefined,
  };
}
