import { describe, expect, it } from 'vitest';
import {
  CONTAINER_STANDARD_3,
  billOverage,
  billingPeriodStart,
  periodMs,
  prorateMonthly,
} from '../src/admin/pricing';
import { emptyUsage, estimateCosts, formatBytes } from '../src/admin/costEstimate';

describe('billingPeriodStart', () => {
  it('uses cycle day in current month when date is on/after cycle day', () => {
    const now = Date.UTC(2026, 7, 8);
    expect(billingPeriodStart(now, 1)).toBe(Date.UTC(2026, 7, 1));
    expect(billingPeriodStart(now, 5)).toBe(Date.UTC(2026, 7, 5));
  });

  it('rolls back to previous month before cycle day', () => {
    const now = Date.UTC(2026, 7, 3);
    expect(billingPeriodStart(now, 15)).toBe(Date.UTC(2026, 6, 15));
  });
});

describe('periodMs billing', () => {
  it('spans from billing start with full-month quotas flag', () => {
    const now = Date.UTC(2026, 7, 8, 12);
    const p = periodMs('billing', now, 1);
    expect(p.start).toBe(Date.UTC(2026, 7, 1));
    expect(p.end).toBe(now);
    expect(p.fullMonthQuotas).toBe(true);
  });
});

describe('estimateCosts gross rates (no included quotas)', () => {
  it('does not include Workers Paid plan in total', () => {
    const est = estimateCosts('billing', emptyUsage(), [], Date.UTC(2026, 7, 8), 1);
    expect(est.lineItems.find((i) => i.id === 'plan_subscription')).toBeUndefined();
    expect(est.totalUsd).toBe(0);
    expect(est.billingStart).toBe(Date.UTC(2026, 7, 1));
  });

  it('bills all email at list rate', () => {
    const usage = emptyUsage();
    usage.emailSent = 4_000;
    const est = estimateCosts('billing', usage, [], Date.UTC(2026, 7, 8), 1);
    expect(est.lineItems.find((i) => i.id === 'email')?.usd).toBe(1.4);
  });

  it('bills all workers requests at list rate', () => {
    const usage = emptyUsage();
    usage.workersRequests = 1_000_000;
    const est = estimateCosts('billing', usage);
    expect(est.lineItems.find((i) => i.id === 'workers')?.usd).toBe(0.3);
  });

  it('bills container from GraphQL allocated metrics', () => {
    const usage = emptyUsage();
    usage.containerCpuTimeSec = 23_000;
    usage.containerMemoryByteSeconds = 100_000 * 1024 ** 3; // 100k GiB-s
    usage.containerDiskByteSeconds = 800_000 * 1_000_000_000; // 800k GB-s
    usage.containerActiveSeconds = 100_000 / 8;
    usage.containerTxBytes = 1_000_000;
    const est = estimateCosts('billing', usage);
    const row = est.lineItems.find((i) => i.id === 'containers')!;
    expect(row.usd).toBeGreaterThan(0);
    expect(row.usageLabel).toContain('23,000');
    expect(row.usageLabel).toContain('GiB-s memory');
    expect(row.usageLabel).toContain('GB-s disk');
  });

  it('bills container active time with standard-3 dims', () => {
    const usage = emptyUsage();
    usage.containerActiveSeconds = 100 * 3600;
    const est = estimateCosts('billing', usage);
    expect(est.lineItems.find((i) => i.id === 'containers')?.usd).toBeGreaterThan(0);
    expect(est.lineItems.find((i) => i.id === 'containers')?.usageLabel).toContain(
      '2 vCPU · 8 GiB · 16 GB disk',
    );
  });

  it('shows complete R2 usage labels', () => {
    const usage = emptyUsage();
    usage.r2StorageBytes = 98_900;
    usage.r2StorageGbMonths = 0.00001;
    usage.r2ClassA = 110;
    usage.r2ClassB = 600;
    usage.r2ObjectCount = 5;
    usage.r2OperationsByAction = { PutObject: 60, GetObject: 500, ListObjects: 50 };
    const est = estimateCosts('billing', usage);
    const label = est.lineItems.find((i) => i.id === 'r2')!.usageLabel;
    expect(label).toContain(formatBytes(98_900));
    expect(label).toContain('Class A 110');
    expect(label).toContain('Class B 600');
    expect(label).toContain('PutObject=60');
    expect(label).toContain('GetObject=500');
    expect(label).toContain('ListObjects=50');
  });

  it('prices tiny R2 usage proportionally (no million-unit ceil)', () => {
    const usage = emptyUsage();
    usage.r2ClassA = 44;
    usage.r2ClassB = 60;
    usage.r2StorageGbMonths = 0.002;
    const est = estimateCosts('billing', usage);
    // 44/1e6*4.5 + 60/1e6*0.36 + 0.002*0.015 ≈ 0.00025 → rounded to 0.0002
    expect(est.lineItems.find((i) => i.id === 'r2')!.usd).toBe(0.0002);
    expect(est.lineItems.find((i) => i.id === 'r2')!.usd).toBeLessThan(0.01);
  });
});

describe('billOverage', () => {
  it('returns 0 under included', () => {
    expect(billOverage(100, 200, 1)).toBe(0);
  });
  it('bills excess', () => {
    expect(billOverage(300, 200, 0.5)).toBe(50);
  });
});

describe('container rates', () => {
  it('has standard-3 dims from Cloudflare docs', () => {
    expect(CONTAINER_STANDARD_3.memoryGiB).toBe(8);
    expect(CONTAINER_STANDARD_3.vcpu).toBe(2);
    expect(CONTAINER_STANDARD_3.diskGb).toBe(16);
    expect(prorateMonthly(30, 15)).toBe(15);
  });
});
