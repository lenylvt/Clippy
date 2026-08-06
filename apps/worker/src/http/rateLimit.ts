/**
 * Best-effort in-memory rate limiter (per Worker isolate).
 * Not shared across isolates/regions — defense in depth alongside OTP cooldown / job quota.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 8_000;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
    if (buckets.size < MAX_BUCKETS * 0.75) break;
  }
  // Hard cap: drop oldest half if still over.
  if (buckets.size >= MAX_BUCKETS) {
    let i = 0;
    for (const key of buckets.keys()) {
      buckets.delete(key);
      if (++i >= MAX_BUCKETS / 2) break;
    }
  }
}

/** Consume one token from the window; returns whether the request is allowed. */
export function takeRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  prune(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { ok: true };
}

/** Client IP for rate keys (Cloudflare / generic proxy / unknown). */
export function clientIp(request: Request): string {
  const cf = request.headers.get('CF-Connecting-IP')?.trim();
  if (cf) return cf;
  const xff = request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim();
  if (xff) return xff;
  return 'unknown';
}

/** Test-only: clear buckets between cases. */
export function resetRateLimitForTests() {
  buckets.clear();
}
