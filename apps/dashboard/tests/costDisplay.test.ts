import { describe, expect, it } from 'vitest';
import {
  estimateCosts,
  emptyUsage,
  formatBytes,
} from '../../worker/src/admin/costEstimate';

describe('dashboard cost display helpers', () => {
  it('totals usage only (no plan subscription)', () => {
    const est = estimateCosts('30d', emptyUsage());
    expect(est.totalUsd).toBe(0);
    expect(est.lineItems.some((i) => i.id === 'plan_subscription')).toBe(false);
  });

  it('exposes full usage snapshot fields for overview', () => {
    const usage = emptyUsage();
    usage.r2StorageBytes = 98_900;
    usage.r2ClassA = 110;
    usage.r2ClassB = 600;
    usage.workersRequests = 42;
    usage.d1RowsRead = 1000;
    usage.doRequests = 10;
    usage.containerActiveSeconds = 30;
    usage.emailSent = 2;
    const est = estimateCosts('billing', usage, [], Date.UTC(2026, 7, 8), 1);
    expect(est.usage.r2StorageBytes).toBe(98_900);
    expect(est.usage.r2ClassA).toBe(110);
    expect(est.usage.r2ClassB).toBe(600);
    expect(formatBytes(est.usage.r2StorageBytes)).toBe('98.9 kB');
    expect(est.lineItems.map((i) => i.id)).toEqual([
      'workers',
      'r2',
      'd1',
      'durable_objects',
      'containers',
      'email',
    ]);
  });
});
