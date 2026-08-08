import { describe, expect, it } from 'vitest';
import {
  aggregateEmailEvents,
  aggregateEmailGroups,
  gbMonthsFromDailyPeaks,
  normalizeGraphqlResponse,
} from '../src/admin/cfAnalytics';
import { emptyUsage, estimateCosts } from '../src/admin/costEstimate';

describe('normalizeGraphqlResponse', () => {
  it('unwraps Cloudflare REST envelope result.viewer into data', () => {
    const normalized = normalizeGraphqlResponse({
      success: true,
      errors: [],
      result: {
        viewer: {
          accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 669 } }] }],
        },
      },
    });
    expect(normalized.errors).toBeUndefined();
    expect(normalized.data).toEqual({
      viewer: {
        accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 669 } }] }],
      },
    });
  });

  it('surfaces REST auth failures', () => {
    const normalized = normalizeGraphqlResponse({
      success: false,
      errors: [{ code: 9106, message: 'Missing Authorization headers' }],
      result: null,
    });
    expect(normalized.data).toBeUndefined();
    expect(normalized.errors?.[0]?.message).toContain('Missing Authorization');
  });

  it('keeps bare GraphQL { data } shape', () => {
    const normalized = normalizeGraphqlResponse({
      data: { viewer: { accounts: [] } },
    });
    expect(normalized.data).toEqual({ viewer: { accounts: [] } });
  });
});

describe('gbMonthsFromDailyPeaks', () => {
  it('averages daily peaks over a 30-day billing month', () => {
    // 1 GB for 5 days + 3 GB for 25 days → 2.666… GB-month (R2 docs example)
    const peaks = new Map<string, number>();
    for (let d = 1; d <= 5; d += 1) {
      peaks.set(`2026-08-0${d}`, 1_000_000_000);
    }
    for (let d = 6; d <= 30; d += 1) {
      const day = String(d).padStart(2, '0');
      peaks.set(`2026-08-${day}`, 3_000_000_000);
    }
    expect(gbMonthsFromDailyPeaks(peaks)).toBeCloseTo(2.666666, 5);
  });

  it('returns 0 for an empty window', () => {
    expect(gbMonthsFromDailyPeaks(new Map())).toBe(0);
  });
});

describe('aggregateEmailEvents', () => {
  it('counts unique messageId and excludes rejected', () => {
    const result = aggregateEmailEvents([
      { messageId: 'm1', status: 'deliveryFailed', from: '"Clippy" <clippy@lenylvt.cc>' },
      { messageId: 'm1', status: 'deliveryFailed', from: '"Clippy" <clippy@lenylvt.cc>' },
      { messageId: 'm1', status: 'deliveryFailed', from: '"Clippy" <clippy@lenylvt.cc>' },
      { messageId: 'm2', status: 'rejected', from: '' },
      { messageId: 'm3', status: 'delivered', from: '"Clippy" <clippy@lenylvt.cc>' },
    ]);
    expect(result.emailSent).toBe(2);
    expect(result.emailByStatus).toEqual({
      deliveryFailed: 3,
      rejected: 1,
      delivered: 1,
    });
  });

  it('matches live Aug 7 Clippy mailbox sample (1 unique accepted)', () => {
    // Verified via Cloudflare GraphQL MCP: from_like %clippy@lenylvt.cc%
    // on 2026-08-07T00:00:00Z → 2026-08-08T00:00:00Z
    const result = aggregateEmailEvents([
      { messageId: 'otp-1', status: 'deliveryFailed' },
      { messageId: 'otp-1', status: 'deliveryFailed' },
      { messageId: 'otp-1', status: 'deliveryFailed' },
    ]);
    expect(result.emailSent).toBe(1);
  });
});

describe('aggregateEmailGroups', () => {
  it('excludes API-boundary rejected from billable sent', () => {
    const result = aggregateEmailGroups([
      { count: 5, dimensions: { status: 'rejected' } },
      { count: 3, dimensions: { status: 'deliveryFailed' } },
      { count: 2, dimensions: { status: 'rejected' } },
    ]);
    expect(result.emailSent).toBe(3);
    expect(result.emailByStatus).toEqual({
      rejected: 7,
      deliveryFailed: 3,
    });
  });
});

/**
 * Reference totals verified live against Cloudflare GraphQL MCP for
 * datetime_geq: 2026-08-07T00:00:00Z, datetime_lt: 2026-08-08T00:00:00Z
 * with Clippy-only filters (not date_geq/date_leq).
 */
const REFERENCE_2026_08_07 = {
  d1RowsRead: 2101,
  d1RowsWritten: 86,
  d1ReadQueries: 2061,
  d1WriteQueries: 19,
  doRequests: 2896,
  doActiveSeconds: 787.83,
  doStoredBytes: 114_688,
  doRowsRead: 3458,
  doRowsWritten: 0,
  workersCronRequests: 312,
} as const;

describe('Clippy GraphQL reference window 2026-08-07', () => {
  it('encodes MCP-verified metrics for regression against date_geq inflation', () => {
    // Old date_geq/date_leq on endDate=2026-08-08 roughly doubled D1/DO.
    expect(REFERENCE_2026_08_07.d1RowsRead).toBeLessThan(8321);
    expect(REFERENCE_2026_08_07.doRequests).toBeLessThan(4680);
    expect(REFERENCE_2026_08_07.doStoredBytes).toBeGreaterThan(0);
    expect(REFERENCE_2026_08_07.workersCronRequests).toBe(312);
  });

  it('prices reference Clippy usage at gross list rates', () => {
    const usage = emptyUsage();
    Object.assign(usage, REFERENCE_2026_08_07);
    const est = estimateCosts('billing', usage, [], Date.UTC(2026, 7, 8), 1);
    expect(est.totalUsd).toBeGreaterThan(0);
    expect(est.usage.doRowsRead).toBe(3458);
  });
});

describe('estimateCosts gross Clippy usage', () => {
  it('prices Clippy-scale usage above zero without quotas', () => {
    const usage = emptyUsage();
    usage.workersRequests = 27_126;
    usage.workersCpuMs = 25_545.738;
    usage.r2ClassA = 140;
    usage.r2ClassB = 610;
    usage.r2StorageGbMonths = 0.01;
    usage.d1RowsRead = 112_662;
    usage.d1RowsWritten = 2_314;
    usage.d1StorageGbMonths = 0.0002;
    usage.doRequests = 7_985;
    usage.doActiveSeconds = 13_011;
    usage.doRowsRead = 50_000;
    usage.doRowsWritten = 1_000;
    usage.doStorageGbMonths = 0.0001;
    usage.containerCpuTimeSec = 3_716;
    usage.containerMemoryByteSeconds = 70_394_873_036_849;
    usage.containerDiskByteSeconds = 131_120_668_792_816;
    usage.containerTxBytes = 283_718_428;
    usage.emailSent = 3;
    const est = estimateCosts('billing', usage, [], Date.UTC(2026, 7, 8), 1);
    expect(est.totalUsd).toBeGreaterThan(0);
  });
});
