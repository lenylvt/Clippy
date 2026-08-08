/**
 * Cloudflare Workers Paid public rates (USD) — used for cost estimates.
 * Align with https://developers.cloudflare.com/workers/platform/pricing/
 */

export const WORKERS_PAID_PLAN_USD = 5;

export const WORKERS_INCLUDED = {
  requests: 10_000_000,
  cpuMs: 30_000_000,
} as const;

export const WORKERS_RATES = {
  perMillionRequests: 0.3,
  perMillionCpuMs: 0.02,
} as const;

export const R2_RATES = {
  storagePerGbMonth: 0.015,
  classAPerMillion: 4.5,
  classBPerMillion: 0.36,
  includedStorageGb: 10,
  includedClassA: 1_000_000,
  includedClassB: 10_000_000,
} as const;

export const D1_RATES = {
  rowsReadPerMillion: 0.001,
  rowsWrittenPerMillion: 1.0,
  storagePerGbMonth: 0.75,
  includedRowsRead: 25_000_000_000,
  includedRowsWritten: 50_000_000,
  includedStorageGb: 5,
} as const;

export const DO_RATES = {
  requestsPerMillion: 0.15,
  durationPerMillionGbS: 12.5,
  includedRequests: 1_000_000,
  includedGbS: 400_000,
  /** SQLite rows — same rates/included as D1. */
  includedRowsRead: 25_000_000_000,
  includedRowsWritten: 50_000_000,
  rowsReadPerMillion: 0.001,
  rowsWrittenPerMillion: 1.0,
  includedStorageGb: 5,
  storagePerGbMonth: 0.2,
  memoryGb: 0.128,
} as const;

/** https://developers.cloudflare.com/containers/platform-details/limits/ */
export const CONTAINER_STANDARD_3 = {
  memoryGiB: 8,
  vcpu: 2,
  diskGb: 16,
  memoryPerGiBSecond: 0.000_002_5,
  vcpuPerSecond: 0.000_02,
  diskPerGbSecond: 0.000_000_07,
  includedMemoryGiBHours: 25,
  includedVcpuMinutes: 375,
  includedDiskGbHours: 200,
  /** All currently supported placement regions are North America or Europe. */
  includedEgressGb: 1_000,
  egressPerGb: 0.025,
} as const;

export const EMAIL_RATES = {
  includedPerMonth: 3_000,
  perThousand: 0.35,
} as const;

/** `billing` = current Cloudflare billing cycle (invoice window). */
export type PeriodKey = 'billing' | 'today' | '7d' | '30d' | 'mtd';

/**
 * Start of the current billing period.
 * `cycleDay` is the day-of-month the CF subscription renews (1–28).
 * Defaults to 1 (calendar month) when unset.
 */
export function billingPeriodStart(now = Date.now(), cycleDay = 1): number {
  const day = Math.min(28, Math.max(1, Math.floor(cycleDay)));
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const date = d.getUTCDate();
  if (date >= day) {
    return Date.UTC(y, m, day);
  }
  return Date.UTC(y, m - 1, day);
}

export function periodMs(
  key: PeriodKey,
  now = Date.now(),
  cycleDay = 1,
): { start: number; end: number; days: number; fullMonthQuotas: boolean } {
  const end = now;
  const d = new Date(now);
  if (key === 'billing') {
    const start = billingPeriodStart(now, cycleDay);
    return {
      start,
      end,
      days: Math.max((end - start) / 86_400_000, 1 / 24),
      fullMonthQuotas: true,
    };
  }
  if (key === 'today') {
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return {
      start,
      end,
      days: Math.max((end - start) / 86_400_000, 1 / 24),
      fullMonthQuotas: false,
    };
  }
  if (key === 'mtd') {
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    return {
      start,
      end,
      days: Math.max((end - start) / 86_400_000, 1 / 24),
      fullMonthQuotas: true,
    };
  }
  const days = key === '7d' ? 7 : 30;
  return {
    start: end - days * 86_400_000,
    end,
    days,
    fullMonthQuotas: key === '30d',
  };
}

/** Prorate monthly included quotas to a shorter window. */
export function prorateMonthly(included: number, days: number): number {
  return (included * days) / 30;
}

export function billOverage(usage: number, included: number, ratePerUnit: number): number {
  const billable = Math.max(0, usage - included);
  return billable * ratePerUnit;
}
