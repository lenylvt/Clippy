/** Parse JSON request body as a plain object (reject arrays / null / primitives). */

export type JsonObjectResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: 'invalid_json' | 'invalid_body' };

export async function readJsonObject(request: Request): Promise<JsonObjectResult> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, error: 'invalid_json' };
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'invalid_body' };
  }
  return { ok: true, body: raw as Record<string, unknown> };
}

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
