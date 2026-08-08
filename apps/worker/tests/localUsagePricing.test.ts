import { emptyUsage, estimateCosts, formatBytes } from '../src/admin/costEstimate';
import { describe, expect, it } from 'vitest';

describe('local-style usage still prices', () => {
  it('prices non-zero workers/r2/d1/do/container from estimated usage', () => {
    const usage = emptyUsage();
    usage.workersRequests = 15_000_000;
    usage.workersCpuMs = 40_000_000;
    usage.r2ClassA = 2_000_000;
    usage.r2ClassB = 11_000_000;
    usage.r2StorageBytes = 11_000_000_000;
    usage.r2StorageGbMonths = 11;
    usage.r2ObjectCount = 12;
    usage.r2OperationsByAction = {
      ListObjects: 50,
      PutObject: 60,
      GetObject: 500,
      HeadObject: 100,
    };
    usage.d1RowsRead = 26_000_000_000;
    usage.d1RowsWritten = 51_000_000;
    usage.d1StorageBytes = 6_000_000_000;
    usage.d1StorageGbMonths = 6;
    usage.doRequests = 2_000_000;
    usage.doActiveSeconds = 4_000_000;
    usage.containerActiveSeconds = 20_000;
    usage.containerCpuTimeSec = 23_000;
    usage.containerMemoryByteSeconds = 100_000 * 1024 ** 3;
    usage.containerDiskByteSeconds = 800_000 * 1_000_000_000;
    usage.containerTxBytes = 50_000_000;
    usage.emailSent = 4_000;
    const est = estimateCosts('billing', usage, ['graphql'], Date.UTC(2026, 7, 8), 1);
    expect(est.lineItems.find((i) => i.id === 'workers')!.usd).toBeGreaterThan(0);
    expect(est.lineItems.find((i) => i.id === 'r2')!.usd).toBeGreaterThan(0);
    expect(est.lineItems.find((i) => i.id === 'containers')!.usd).toBeGreaterThan(0);
    expect(est.lineItems.find((i) => i.id === 'containers')!.usageLabel).toContain('CPU s');
    expect(est.lineItems.find((i) => i.id === 'r2')!.usageLabel).toContain('Class A 2,000,000');
    expect(est.lineItems.find((i) => i.id === 'r2')!.usageLabel).toContain('Class B 11,000,000');
    expect(est.lineItems.find((i) => i.id === 'r2')!.usageLabel).toContain('11.000 GB');
  });
});

describe('formatBytes', () => {
  it('matches Cloudflare-style SI display', () => {
    expect(formatBytes(98_900)).toBe('98.9 kB');
    expect(formatBytes(0)).toBe('0 B');
  });
});
