import type { Env } from '../types';
import { emptyUsage, type UsageSnapshot } from './costEstimate';
import { periodMs, type PeriodKey } from './pricing';

const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

/** Clippy D1 id from wrangler.jsonc — override with CF_D1_DATABASE_ID. */
const CLIPPY_D1_ID = '1d9c8f39-e352-4b2f-b1d6-2dd6959e9501';

/** Clippy Containers app (clippy-clipcontainer) — override with CF_CONTAINER_APP_ID. */
const CLIPPY_CONTAINER_APP_ID = 'a0381f0a-2215-47ff-ae6a-274bc183cd7c';

/** DO namespaces for Clippy (from wrangler durable_objects). */
const CLIPPY_DO_NAMESPACES: Record<string, string> = {
  '5f9276b382af45419ca1bf23bcf8c41b': 'ClipContainer',
  ae1fedb1f0304a56bed9b6310e5b4b4e: 'JobQueue',
};

const CLIPPY_DO_NAMESPACE_IDS = Object.keys(CLIPPY_DO_NAMESPACES);

/** Zone for Email Sending (lenylvt.cc / clippy@…). */
const CLIPPY_ZONE_ID = '03513d32ffe29dd95a4a972ffd1fefde';

/** Exact mailbox used by Clippy OTP mail. */
export const CLIPPY_EMAIL_FROM = 'clippy@lenylvt.cc';

/** standard-3 provisioned memory for deriving active wall time from byte-seconds. */
const CONTAINER_MEMORY_BYTES = 8 * 1024 ** 3;

/** R2 Class A — https://developers.cloudflare.com/r2/pricing/ */
const R2_CLASS_A = new Set([
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'LifecycleStorageTierTransition',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration',
]);

/** R2 Class B — https://developers.cloudflare.com/r2/pricing/ */
const R2_CLASS_B = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration',
]);

type GqlResult = {
  data?: unknown;
  errors?: Array<{ message: string }>;
};

type EmailEvent = {
  messageId?: string;
  status?: string;
  from?: string;
};

/**
 * Cloudflare `/client/v4/graphql` returns a REST envelope:
 * `{ success, result: { viewer… }, errors }` — not bare `{ data, errors }`.
 */
export function normalizeGraphqlResponse(json: unknown): GqlResult {
  if (!json || typeof json !== 'object') {
    return { errors: [{ message: 'empty_graphql' }] };
  }
  const body = json as {
    data?: unknown;
    result?: { data?: unknown; viewer?: unknown } | null;
    errors?: Array<{ message?: string; code?: number | string }>;
    success?: boolean;
  };

  const restErrors =
    Array.isArray(body.errors) && body.errors.length > 0
      ? body.errors.map((e) => ({
          message: e.message ?? (e.code != null ? `code_${e.code}` : 'graphql_error'),
        }))
      : undefined;

  if (body.data != null) {
    return { data: body.data, errors: restErrors };
  }

  const result = body.result;
  if (result && typeof result === 'object') {
    if ('data' in result && result.data != null) {
      return { data: result.data, errors: restErrors };
    }
    if ('viewer' in result && result.viewer != null) {
      return { data: { viewer: result.viewer }, errors: restErrors };
    }
  }

  if (restErrors?.length) return { errors: restErrors };
  if (body.success === false) return { errors: [{ message: 'graphql_unsuccessful' }] };
  return { errors: [{ message: 'empty_graphql' }] };
}

function gqlFailed(res: GqlResult): boolean {
  return Boolean(res.errors?.length) || res.data == null;
}

function gqlErrorTag(res: GqlResult): string {
  const msg = res.errors?.[0]?.message?.replace(/\s+/g, '_').slice(0, 80);
  return msg ? `:${msg}` : '';
}

/** Sum of each day's peak bytes / 1e9 / 30 — Cloudflare GB-month definition. */
export function gbMonthsFromDailyPeaks(peaks: Map<string, number>): number {
  let byteDays = 0;
  for (const bytes of peaks.values()) byteDays += Math.max(0, bytes);
  return byteDays / 1_000_000_000 / 30;
}

/**
 * Email Service billing: rejected at API boundary do not count;
 * hard-bounces / deliveryFailed after accept do count.
 * Count unique messageId (events can repeat per delivery attempt).
 */
export function aggregateEmailEvents(
  events: EmailEvent[],
): { emailSent: number; emailByStatus: Record<string, number> } {
  const emailByStatus: Record<string, number> = {};
  const billableIds = new Set<string>();
  for (const event of events) {
    const status = event.status ?? 'unknown';
    emailByStatus[status] = (emailByStatus[status] ?? 0) + 1;
    if (status === 'rejected') continue;
    const id = event.messageId?.trim();
    if (id) billableIds.add(id);
  }
  return { emailSent: billableIds.size, emailByStatus };
}

/** @deprecated Prefer aggregateEmailEvents — kept for status-group fallbacks. */
export function aggregateEmailGroups(
  groups: Array<{ count?: number; dimensions?: { status?: string } }>,
): { emailSent: number; emailByStatus: Record<string, number> } {
  const emailByStatus: Record<string, number> = {};
  let emailSent = 0;
  for (const group of groups) {
    const status = group.dimensions?.status ?? 'unknown';
    const n = group.count ?? 0;
    emailByStatus[status] = (emailByStatus[status] ?? 0) + n;
    if (status !== 'rejected') emailSent += n;
  }
  return { emailSent, emailByStatus };
}

function accountNode(data: unknown): Record<string, unknown> | null {
  const accounts = (data as { viewer?: { accounts?: unknown[] } })?.viewer?.accounts;
  const first = accounts?.[0];
  return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function graphql(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<GqlResult> {
  let last: GqlResult = { errors: [{ message: 'graphql_untried' }] };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 0);
      const waitMs = Math.max(2_000, retryAfter * 1000, 3_000 * (attempt + 1));
      await sleep(waitMs);
      last = { errors: [{ message: 'http_429' }] };
      continue;
    }
    if (!res.ok) {
      return { errors: [{ message: `http_${res.status}` }] };
    }
    const json = (await res.json().catch(() => null)) as unknown;
    last = normalizeGraphqlResponse(json);
    if (last.errors?.some((e) => /429|rate.?limit/i.test(e.message))) {
      await sleep(3_000 * (attempt + 1));
      continue;
    }
    return last;
  }
  return last;
}

function classifyR2Action(actionType: string): 'A' | 'B' | 'free' | 'unknown' {
  if (R2_CLASS_A.has(actionType)) return 'A';
  if (R2_CLASS_B.has(actionType)) return 'B';
  if (
    actionType === 'DeleteObject' ||
    actionType === 'DeleteBucket' ||
    actionType === 'AbortMultipartUpload'
  ) {
    return 'free';
  }
  return 'unknown';
}

/** Wall-clock container seconds from Clippy jobs (no GraphQL container dataset). */
async function containerSecondsFromJobs(
  env: Env,
  start: number,
  end: number,
): Promise<number> {
  const jobs = await env.DB.prepare(
    `SELECT created_at, updated_at, status, attempts
     FROM jobs
     WHERE (created_at >= ? AND created_at < ?)
        OR (updated_at >= ? AND updated_at < ?)`,
  )
    .bind(start, end, start, end)
    .all<{
      created_at: number;
      updated_at: number;
      status: string;
      attempts: number | null;
    }>();

  let seconds = 0;
  for (const row of jobs.results ?? []) {
    if (row.status === 'queued') continue;
    const duration = Math.max(0, (row.updated_at - row.created_at) / 1000);
    const attempts = Math.max(1, row.attempts ?? 1);
    seconds += Math.min(duration, 900) * Math.min(attempts, 3);
  }
  return seconds;
}

/**
 * Local fallback when CF GraphQL credentials are missing.
 * Only used when token/account are absent — never mixed into GraphQL totals.
 */
export async function collectLocalUsage(
  env: Env,
  period: PeriodKey,
  cycleDay = 1,
): Promise<Partial<UsageSnapshot>> {
  const { start, end } = periodMs(period, Date.now(), cycleDay);
  const days = Math.max((end - start) / 86_400_000, 1 / 24);
  const cronRequests = Math.floor(days * 24 * 12) + Math.floor(days * 24);

  const jobs = await env.DB.prepare(
    `SELECT created_at, updated_at, status, attempts
     FROM jobs
     WHERE (created_at >= ? AND created_at < ?)
        OR (updated_at >= ? AND updated_at < ?)`,
  )
    .bind(start, end, start, end)
    .all<{
      created_at: number;
      updated_at: number;
      status: string;
      attempts: number | null;
    }>();
  const jobRows = jobs.results ?? [];
  let ranJobs = 0;
  let containerActiveSeconds = 0;
  for (const row of jobRows) {
    if (row.status === 'queued') continue;
    ranJobs += 1;
    const duration = Math.max(0, (row.updated_at - row.created_at) / 1000);
    const attempts = Math.max(1, row.attempts ?? 1);
    containerActiveSeconds += Math.min(duration, 900) * Math.min(attempts, 3);
  }

  const [sessions, devices, clipsLive, otpCount, pairingCount, users] =
    await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM sessions WHERE created_at >= ? AND created_at < ?`,
      )
        .bind(start, end)
        .first<{ n: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM devices WHERE created_at >= ? AND created_at < ?`,
      )
        .bind(start, end)
        .first<{ n: number }>(),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM clips WHERE expires_at > ?`)
        .bind(Date.now())
        .first<{ n: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM auth_otps WHERE created_at >= ? AND created_at < ?`,
      )
        .bind(start, end)
        .first<{ n: number }>()
        .catch(() => ({ n: 0 })),
      env.DB.prepare(
        `SELECT COUNT(*) AS n FROM pairing_codes WHERE created_at >= ? AND created_at < ?`,
      )
        .bind(start, end)
        .first<{ n: number }>()
        .catch(() => ({ n: 0 })),
      env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>(),
    ]);

  let r2StorageBytes = 0;
  let r2ObjectCount = 0;
  let listed = await env.CLIPS.list({ limit: 1000 });
  for (;;) {
    for (const obj of listed.objects) {
      r2StorageBytes += obj.size;
      r2ObjectCount += 1;
    }
    if (!listed.truncated) break;
    listed = await env.CLIPS.list({ limit: 1000, cursor: listed.cursor });
  }

  const jobHttp = jobRows.length * 8 + ranJobs * 40;
  const authHttp = (otpCount?.n ?? 0) * 3 + (sessions?.n ?? 0) * 2;
  const pairingHttp = (pairingCount?.n ?? 0) * 4 + (devices?.n ?? 0) * 2;

  return {
    workersRequests: cronRequests + jobHttp + authHttp + pairingHttp,
    workersCpuMs: cronRequests * 25 + jobHttp * 12 + authHttp * 5 + pairingHttp * 5,
    workersCronRequests: cronRequests,
    workersErrors: 0,
    workersSubrequests: 0,
    r2ClassA: ranJobs * 2 + jobRows.length,
    r2ClassB: ranJobs * 8,
    r2StorageBytes,
    r2StorageGbMonths: (r2StorageBytes / 1_000_000_000) * (days / 30),
    r2ObjectCount,
    r2OperationsByAction: {},
    d1RowsRead:
      jobRows.length * 30 +
      ranJobs * 80 +
      cronRequests * 15 +
      (sessions?.n ?? 0) * 4 +
      (otpCount?.n ?? 0) * 3,
    d1RowsWritten:
      jobRows.length * 6 +
      ranJobs * 20 +
      (otpCount?.n ?? 0) * 2 +
      (sessions?.n ?? 0) +
      (devices?.n ?? 0) * 2 +
      (pairingCount?.n ?? 0) * 2 +
      (users?.n ?? 0),
    d1ReadQueries: 0,
    d1WriteQueries: 0,
    d1StorageBytes: 0,
    d1StorageGbMonths: 0,
    doRequests: cronRequests * 2 + jobRows.length * 3 + ranJobs * 10,
    doActiveSeconds: containerActiveSeconds + cronRequests * 0.5,
    doRowsRead: 0,
    doRowsWritten: 0,
    doStoredBytes: 0,
    doStorageGbMonths: 0,
    doByClass: {},
    containerActiveSeconds,
    containerCpuTimeSec: 0,
    containerMemoryByteSeconds: 0,
    containerDiskByteSeconds: 0,
    containerTxBytes: 0,
    containerTxBytesByRegion: {},
    emailSent: otpCount?.n ?? 0,
    emailByStatus: { estimated: otpCount?.n ?? 0 },
  };
}

export async function collectCloudflareUsage(
  env: Env,
  period: PeriodKey,
): Promise<{ usage: UsageSnapshot; missingSources: string[] }> {
  const cycleDay = Number(env.CF_BILLING_CYCLE_DAY ?? 1) || 1;
  const cacheKey = new Request(
    `https://clippy.internal/admin-usage/${period}/${cycleDay}`,
  );
  try {
    const cache = await caches.open('clippy-admin-usage');
    const cached = await cache.match(cacheKey);
    if (cached) {
      const body = (await cached.json()) as {
        usage: UsageSnapshot;
        missingSources: string[];
      };
      if (body?.usage) {
        return {
          usage: body.usage,
          missingSources: [...(body.missingSources ?? []), 'cache_hit'],
        };
      }
    }
  } catch {
    // Cache API unavailable — continue without cache.
  }

  const collected = await collectCloudflareUsageUncached(env, period);
  try {
    const hasHardFailure = collected.missingSources.some((s) =>
      /http_429|http_401|cf_api_token/.test(s),
    );
    if (!hasHardFailure) {
      const cache = await caches.open('clippy-admin-usage');
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(collected), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60',
          },
        }),
      );
    }
  } catch {
    // ignore cache write failures
  }
  return collected;
}

async function collectCloudflareUsageUncached(
  env: Env,
  period: PeriodKey,
): Promise<{ usage: UsageSnapshot; missingSources: string[] }> {
  const usage = emptyUsage();
  const missing: string[] = [];
  const cycleDay = Number(env.CF_BILLING_CYCLE_DAY ?? 1) || 1;
  const { start, end, days } = periodMs(period, Date.now(), cycleDay);
  // Exclusive end bound — matches Cloudflare dashboard windows.
  const startIso = new Date(start).toISOString();
  const endIso = new Date(end).toISOString();

  const token = env.CF_API_TOKEN?.trim();
  const accountId = env.CF_ACCOUNT_ID?.trim();
  const bucket = env.R2_BUCKET?.trim() || 'clippy-clips';
  const workerName = env.CF_WORKER_NAME?.trim() || 'clippy';
  const d1Id = env.CF_D1_DATABASE_ID?.trim() || CLIPPY_D1_ID;
  const containerAppId = env.CF_CONTAINER_APP_ID?.trim() || CLIPPY_CONTAINER_APP_ID;

  if (!token || !accountId) {
    missing.push('cf_api_token', 'graphql');
    Object.assign(usage, await collectLocalUsage(env, period, cycleDay));
    return { usage, missingSources: missing };
  }

  const zoneId = env.CF_ZONE_ID?.trim() || CLIPPY_ZONE_ID;
  const namespaceIds = CLIPPY_DO_NAMESPACE_IDS;

  // Two GraphQL round-trips only (account + zone) to stay under CF rate limits.
  const accountQ = `
    query(
      $accountTag: String!
      $start: Time!
      $end: Time!
      $scriptName: String!
      $bucketName: String!
      $databaseId: String!
      $namespaceIds: [string!]!
      $applicationId: String!
    ) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_lt: $end
              scriptName: $scriptName
            }
          ) {
            sum { requests errors subrequests cpuTimeUs }
          }
          workersInvocationsScheduled(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_lt: $end
              scriptName: $scriptName
            }
          ) {
            datetime
            cron
            status
          }
          r2OperationsAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_lt: $end
              bucketName: $bucketName
            }
          ) {
            sum { requests }
            dimensions { actionType }
          }
          r2StorageAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_lt: $end
              bucketName: $bucketName
            }
            orderBy: [datetime_DESC]
          ) {
            max { payloadSize metadataSize objectCount }
            dimensions { datetime }
          }
          d1AnalyticsAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_lt: $end
              databaseId: $databaseId
            }
          ) {
            sum { rowsRead rowsWritten readQueries writeQueries }
          }
          d1StorageAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_lt: $end
              databaseId: $databaseId
            }
            orderBy: [datetime_DESC]
          ) {
            max { databaseSizeBytes }
            dimensions { datetime date }
          }
          durableObjectsInvocationsAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_lt: $end
              scriptName: $scriptName
              namespaceId_in: $namespaceIds
            }
          ) {
            sum { requests }
            dimensions { namespaceId }
          }
          durableObjectsPeriodicGroups(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_lt: $end
              namespaceId_in: $namespaceIds
            }
          ) {
            sum { activeTime rowsRead rowsWritten }
            dimensions { namespaceId }
          }
          durableObjectsSqlStorageGroups(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_lt: $end
              namespaceId_in: $namespaceIds
            }
            orderBy: [datetime_DESC]
          ) {
            max { storedBytes }
            dimensions { datetime namespaceId }
          }
          containersUsageAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_lt: $end
              applicationId: $applicationId
            }
          ) {
            sum { cpuTimeSec allocatedMemory allocatedDisk txBytes }
            dimensions { region }
          }
        }
      }
    }`;

  const accountRes = await graphql(token, accountQ, {
    accountTag: accountId,
    start: startIso,
    end: endIso,
    scriptName: workerName,
    bucketName: bucket,
    databaseId: d1Id,
    namespaceIds,
    applicationId: containerAppId,
  });

  if (gqlFailed(accountRes)) {
    const tag = gqlErrorTag(accountRes);
    missing.push(
      `workers_graphql${tag}`,
      `workers_cron_graphql${tag}`,
      `r2_ops_graphql${tag}`,
      `r2_storage_graphql${tag}`,
      `d1_graphql${tag}`,
      `d1_storage_graphql${tag}`,
      `do_invocations_graphql${tag}`,
      `do_periodic_graphql${tag}`,
      `do_storage_graphql${tag}`,
      `containers_graphql${tag}`,
    );
    const daysApprox = Math.max((end - start) / 86_400_000, 1 / 24);
    usage.workersCronRequests =
      Math.floor(daysApprox * 24 * 12) + Math.floor(daysApprox * 24);
    missing.push('workers_cron_estimated');
    try {
      let listed = await env.CLIPS.list({ limit: 1000 });
      let bytes = 0;
      let count = 0;
      for (;;) {
        for (const obj of listed.objects) {
          bytes += obj.size;
          count += 1;
        }
        if (!listed.truncated) break;
        listed = await env.CLIPS.list({ limit: 1000, cursor: listed.cursor });
      }
      usage.r2StorageBytes = bytes;
      usage.r2StorageGbMonths = (bytes / 1_000_000_000) * (days / 30);
      usage.r2ObjectCount = count;
      missing.push('r2_storage_gb_month_estimated');
    } catch {
      missing.push('r2_list');
    }
    usage.containerActiveSeconds = await containerSecondsFromJobs(env, start, end);
    missing.push('containers_estimated_from_jobs');
  } else {
    const acc = accountNode(accountRes.data) ?? {};

    {
      const rows =
        (acc.workersInvocationsAdaptive as Array<{
          sum?: {
            requests?: number;
            errors?: number;
            subrequests?: number;
            cpuTimeUs?: number;
          };
        }>) ?? [];
      let req = 0;
      let errors = 0;
      let sub = 0;
      let cpuUs = 0;
      for (const row of rows) {
        req += row.sum?.requests ?? 0;
        errors += row.sum?.errors ?? 0;
        sub += row.sum?.subrequests ?? 0;
        cpuUs += row.sum?.cpuTimeUs ?? 0;
      }
      usage.workersRequests = req;
      usage.workersErrors = errors;
      usage.workersSubrequests = sub;
      usage.workersCpuMs = cpuUs / 1000;
    }

    {
      const rows =
        (acc.workersInvocationsScheduled as Array<{
          datetime?: string;
          cron?: string;
          status?: string;
        }>) ?? [];
      usage.workersCronRequests = rows.length;
    }

    {
      const groups =
        (acc.r2OperationsAdaptiveGroups as Array<{
          sum?: { requests?: number };
          dimensions?: { actionType?: string };
        }>) ?? [];
      usage.r2ClassA = 0;
      usage.r2ClassB = 0;
      usage.r2OperationsByAction = {};
      for (const g of groups) {
        const action = g.dimensions?.actionType ?? 'Unknown';
        const n = g.sum?.requests ?? 0;
        usage.r2OperationsByAction[action] =
          (usage.r2OperationsByAction[action] ?? 0) + n;
        const klass = classifyR2Action(action);
        if (klass === 'A') usage.r2ClassA += n;
        else if (klass === 'B') usage.r2ClassB += n;
      }
    }

    {
      const groups =
        (acc.r2StorageAdaptiveGroups as Array<{
          max?: {
            payloadSize?: number;
            metadataSize?: number;
            objectCount?: number;
          };
          dimensions?: { datetime?: string };
        }>) ?? [];
      const latest = groups[0]?.max;
      if (latest && typeof latest.payloadSize === 'number') {
        usage.r2StorageBytes = latest.payloadSize + (latest.metadataSize ?? 0);
        usage.r2ObjectCount = latest.objectCount ?? 0;
        const dailyPeaks = new Map<string, number>();
        for (const group of groups) {
          const datetime = group.dimensions?.datetime;
          const payload = group.max?.payloadSize;
          if (!datetime || typeof payload !== 'number') continue;
          const date = datetime.slice(0, 10);
          const bytes = payload + (group.max?.metadataSize ?? 0);
          dailyPeaks.set(date, Math.max(dailyPeaks.get(date) ?? 0, bytes));
        }
        usage.r2StorageGbMonths = gbMonthsFromDailyPeaks(dailyPeaks);
      } else {
        try {
          let listed = await env.CLIPS.list({ limit: 1000 });
          let bytes = 0;
          let count = 0;
          for (;;) {
            for (const obj of listed.objects) {
              bytes += obj.size;
              count += 1;
            }
            if (!listed.truncated) break;
            listed = await env.CLIPS.list({ limit: 1000, cursor: listed.cursor });
          }
          usage.r2StorageBytes = bytes;
          usage.r2StorageGbMonths = (bytes / 1_000_000_000) * (days / 30);
          usage.r2ObjectCount = count;
          missing.push('r2_storage_gb_month_estimated');
        } catch {
          missing.push('r2_list');
        }
      }
    }

    {
      const groups =
        (acc.d1AnalyticsAdaptiveGroups as Array<{
          sum?: {
            rowsRead?: number;
            rowsWritten?: number;
            readQueries?: number;
            writeQueries?: number;
          };
        }>) ?? [];
      usage.d1RowsRead = 0;
      usage.d1RowsWritten = 0;
      usage.d1ReadQueries = 0;
      usage.d1WriteQueries = 0;
      for (const g of groups) {
        usage.d1RowsRead += g.sum?.rowsRead ?? 0;
        usage.d1RowsWritten += g.sum?.rowsWritten ?? 0;
        usage.d1ReadQueries += g.sum?.readQueries ?? 0;
        usage.d1WriteQueries += g.sum?.writeQueries ?? 0;
      }
    }

    {
      const groups =
        (acc.d1StorageAdaptiveGroups as Array<{
          max?: { databaseSizeBytes?: number };
          dimensions?: { datetime?: string; date?: string };
        }>) ?? [];
      usage.d1StorageBytes = groups[0]?.max?.databaseSizeBytes ?? 0;
      const dailyPeaks = new Map<string, number>();
      for (const group of groups) {
        const date =
          group.dimensions?.date ?? group.dimensions?.datetime?.slice(0, 10);
        const bytes = group.max?.databaseSizeBytes;
        if (!date || typeof bytes !== 'number') continue;
        dailyPeaks.set(date, Math.max(dailyPeaks.get(date) ?? 0, bytes));
      }
      usage.d1StorageGbMonths = gbMonthsFromDailyPeaks(dailyPeaks);
    }

    {
      usage.doRequests = 0;
      usage.doByClass = {};
      const inv =
        (acc.durableObjectsInvocationsAdaptiveGroups as Array<{
          sum?: { requests?: number };
          dimensions?: { namespaceId?: string };
        }>) ?? [];
      for (const row of inv) {
        const ns = row.dimensions?.namespaceId ?? '';
        const cls = CLIPPY_DO_NAMESPACES[ns];
        if (!cls) continue;
        const n = row.sum?.requests ?? 0;
        usage.doRequests += n;
        const cur = usage.doByClass[cls] ?? {
          requests: 0,
          activeSeconds: 0,
          storedBytes: 0,
          rowsRead: 0,
          rowsWritten: 0,
        };
        cur.requests += n;
        usage.doByClass[cls] = cur;
      }
    }

    {
      usage.doActiveSeconds = 0;
      usage.doRowsRead = 0;
      usage.doRowsWritten = 0;
      const rows =
        (acc.durableObjectsPeriodicGroups as Array<{
          sum?: {
            activeTime?: number;
            rowsRead?: number;
            rowsWritten?: number;
          };
          dimensions?: { namespaceId?: string };
        }>) ?? [];
      for (const row of rows) {
        const ns = row.dimensions?.namespaceId ?? '';
        const cls = CLIPPY_DO_NAMESPACES[ns];
        if (!cls) continue;
        const activeSeconds = (row.sum?.activeTime ?? 0) / 1e6;
        const rowsRead = row.sum?.rowsRead ?? 0;
        const rowsWritten = row.sum?.rowsWritten ?? 0;
        usage.doActiveSeconds += activeSeconds;
        usage.doRowsRead += rowsRead;
        usage.doRowsWritten += rowsWritten;
        const cur = usage.doByClass[cls] ?? {
          requests: 0,
          activeSeconds: 0,
          storedBytes: 0,
          rowsRead: 0,
          rowsWritten: 0,
        };
        cur.activeSeconds += activeSeconds;
        cur.rowsRead += rowsRead;
        cur.rowsWritten += rowsWritten;
        usage.doByClass[cls] = cur;
      }
    }

    {
      const rows =
        (acc.durableObjectsSqlStorageGroups as Array<{
          max?: { storedBytes?: number };
          dimensions?: { datetime?: string; namespaceId?: string };
        }>) ?? [];
      const latestByNamespace = new Map<string, number>();
      const dailyPeaks = new Map<string, number>();
      for (const row of rows) {
        const namespaceId = row.dimensions?.namespaceId;
        const datetime = row.dimensions?.datetime;
        const bytes = row.max?.storedBytes;
        if (!namespaceId || !datetime || typeof bytes !== 'number') continue;
        if (!latestByNamespace.has(namespaceId)) {
          latestByNamespace.set(namespaceId, bytes);
        }
        const key = `${datetime.slice(0, 10)}:${namespaceId}`;
        dailyPeaks.set(key, Math.max(dailyPeaks.get(key) ?? 0, bytes));
      }
      usage.doStoredBytes = 0;
      for (const [namespaceId, bytes] of latestByNamespace) {
        usage.doStoredBytes += bytes;
        const cls = CLIPPY_DO_NAMESPACES[namespaceId];
        if (!cls) continue;
        const cur = usage.doByClass[cls] ?? {
          requests: 0,
          activeSeconds: 0,
          storedBytes: 0,
          rowsRead: 0,
          rowsWritten: 0,
        };
        cur.storedBytes = bytes;
        usage.doByClass[cls] = cur;
      }
      usage.doStorageGbMonths = gbMonthsFromDailyPeaks(dailyPeaks);
    }

    {
      const groups =
        (acc.containersUsageAdaptiveGroups as Array<{
          sum?: {
            cpuTimeSec?: number;
            allocatedMemory?: number;
            allocatedDisk?: number;
            txBytes?: number;
          };
          dimensions?: { region?: string };
        }>) ?? [];
      usage.containerCpuTimeSec = 0;
      usage.containerMemoryByteSeconds = 0;
      usage.containerDiskByteSeconds = 0;
      usage.containerTxBytes = 0;
      usage.containerTxBytesByRegion = {};
      for (const g of groups) {
        usage.containerCpuTimeSec += g.sum?.cpuTimeSec ?? 0;
        usage.containerMemoryByteSeconds += g.sum?.allocatedMemory ?? 0;
        usage.containerDiskByteSeconds += g.sum?.allocatedDisk ?? 0;
        const txBytes = g.sum?.txBytes ?? 0;
        usage.containerTxBytes += txBytes;
        const region = g.dimensions?.region ?? 'unknown';
        usage.containerTxBytesByRegion[region] =
          (usage.containerTxBytesByRegion[region] ?? 0) + txBytes;
      }
      if (usage.containerMemoryByteSeconds > 0) {
        usage.containerActiveSeconds =
          usage.containerMemoryByteSeconds / CONTAINER_MEMORY_BYTES;
      } else {
        const clipDo = usage.doByClass['ClipContainer']?.activeSeconds;
        if (typeof clipDo === 'number' && clipDo > 0) {
          usage.containerActiveSeconds = clipDo;
        } else {
          usage.containerActiveSeconds = await containerSecondsFromJobs(
            env,
            start,
            end,
          );
          missing.push('containers_estimated_from_jobs');
        }
      }
    }
  }

  const emailQ = `
    query($zoneTag: String!, $start: Time!, $end: Time!, $fromLike: string!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          emailSendingAdaptive(
            limit: 10000
            filter: {
              datetime_geq: $start
              datetime_lt: $end
              from_like: $fromLike
            }
          ) {
            messageId
            status
            from
          }
        }
      }
    }`;
  const emailRes = await graphql(token, emailQ, {
    zoneTag: zoneId,
    start: startIso,
    end: endIso,
    fromLike: `%${CLIPPY_EMAIL_FROM}%`,
  });
  if (gqlFailed(emailRes)) {
    missing.push(`email_graphql${gqlErrorTag(emailRes)}`);
  } else {
    const events =
      (
        emailRes.data as {
          viewer?: {
            zones?: Array<{
              emailSendingAdaptive?: EmailEvent[];
            }>;
          };
        }
      ).viewer?.zones?.[0]?.emailSendingAdaptive ?? [];
    const aggregated = aggregateEmailEvents(events);
    usage.emailSent = aggregated.emailSent;
    usage.emailByStatus = aggregated.emailByStatus;
  }

  return { usage, missingSources: missing };
}
