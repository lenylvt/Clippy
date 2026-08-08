import {
  CONTAINER_STANDARD_3,
  D1_RATES,
  DO_RATES,
  EMAIL_RATES,
  R2_RATES,
  WORKERS_INCLUDED,
  WORKERS_RATES,
  billOverage,
  periodMs,
  prorateMonthly,
  type PeriodKey,
} from './pricing';

export type DoClassUsage = {
  requests: number;
  activeSeconds: number;
  storedBytes: number;
  rowsRead: number;
  rowsWritten: number;
};

export type UsageSnapshot = {
  workersRequests: number;
  workersCpuMs: number;
  workersCronRequests: number;
  workersErrors: number;
  workersSubrequests: number;
  r2ClassA: number;
  r2ClassB: number;
  /** Latest bucket size, for the dashboard's current storage metric. */
  r2StorageBytes: number;
  /** Sum of each day's peak GB divided by 30, matching R2 GB-month billing. */
  r2StorageGbMonths: number;
  r2ObjectCount: number;
  r2OperationsByAction: Record<string, number>;
  d1RowsRead: number;
  d1RowsWritten: number;
  d1ReadQueries: number;
  d1WriteQueries: number;
  /** Latest database size. */
  d1StorageBytes: number;
  /** Sum of each day's peak GB divided by 30. */
  d1StorageGbMonths: number;
  doRequests: number;
  doActiveSeconds: number;
  /** SQLite rows read/written from durableObjectsPeriodicGroups. */
  doRowsRead: number;
  doRowsWritten: number;
  doStoredBytes: number;
  doStorageGbMonths: number;
  doByClass: Record<string, DoClassUsage>;
  /** Wall-clock active seconds (derived from allocated memory / provisioned GiB). */
  containerActiveSeconds: number;
  /** From containersUsageAdaptiveGroups — matches CF dashboard billing estimates. */
  containerCpuTimeSec: number;
  containerMemoryByteSeconds: number;
  containerDiskByteSeconds: number;
  containerTxBytes: number;
  containerTxBytesByRegion: Record<string, number>;
  /** Emails accepted by Email Service; API-boundary rejections are excluded. */
  emailSent: number;
  emailByStatus: Record<string, number>;
};

export type CostLineItem = {
  id: string;
  label: string;
  usageLabel: string;
  usd: number;
  informational?: boolean;
};

export type CostEstimate = {
  period: PeriodKey;
  days: number;
  billingStart: number;
  billingEnd: number;
  usage: UsageSnapshot;
  lineItems: CostLineItem[];
  totalUsd: number;
  missingSources: string[];
};

function roundUsd(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function includedForPeriod(monthly: number, days: number, fullMonth: boolean): number {
  return fullMonth ? monthly : prorateMonthly(monthly, days);
}

function roundedR2Cost(usage: number, included: number, billingUnit: number, unitPrice: number) {
  const billable = Math.max(0, usage - included);
  return billable > 0 ? Math.ceil(billable / billingUnit) * unitPrice : 0;
}

/** SI units matching Cloudflare dashboard (kB = 1000). */
export function formatBytes(bytes: number): string {
  const n = Math.max(0, bytes);
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)} kB`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)} MB`;
  return `${(n / 1_000_000_000).toFixed(3)} GB`;
}


export function estimateCosts(
  period: PeriodKey,
  usage: UsageSnapshot,
  missingSources: string[] = [],
  now = Date.now(),
  cycleDay = 1,
): CostEstimate {
  const { start, end, days, fullMonthQuotas } = periodMs(period, now, cycleDay);
  const lineItems: CostLineItem[] = [];
  const included = (monthly: number) => includedForPeriod(monthly, days, fullMonthQuotas);

  const workersUsd =
    billOverage(
      usage.workersRequests,
      included(WORKERS_INCLUDED.requests),
      WORKERS_RATES.perMillionRequests / 1_000_000,
    ) +
    billOverage(
      usage.workersCpuMs,
      included(WORKERS_INCLUDED.cpuMs),
      WORKERS_RATES.perMillionCpuMs / 1_000_000,
    );
  lineItems.push({
    id: 'workers',
    label: 'Workers (clippy)',
    usageLabel: [
      `${usage.workersRequests.toLocaleString()} requests`,
      `${usage.workersCpuMs.toLocaleString(undefined, { maximumFractionDigits: 2 })} CPU ms`,
      `${usage.workersErrors.toLocaleString()} errors`,
      `${usage.workersSubrequests.toLocaleString()} subrequests`,
      `${usage.workersCronRequests.toLocaleString()} cron (measured)`,
    ].join(' · '),
    usd: roundUsd(workersUsd),
  });

  const r2ActionParts = Object.entries(usage.r2OperationsByAction)
    .sort((a, b) => b[1] - a[1])
    .map(([action, n]) => `${action}=${n.toLocaleString()}`);
  const r2Usd =
    roundedR2Cost(
      usage.r2StorageGbMonths,
      included(R2_RATES.includedStorageGb),
      1,
      R2_RATES.storagePerGbMonth,
    ) +
    roundedR2Cost(
      usage.r2ClassA,
      included(R2_RATES.includedClassA),
      1_000_000,
      R2_RATES.classAPerMillion,
    ) +
    roundedR2Cost(
      usage.r2ClassB,
      included(R2_RATES.includedClassB),
      1_000_000,
      R2_RATES.classBPerMillion,
    );
  lineItems.push({
    id: 'r2',
    label: 'R2 (clippy-clips)',
    usageLabel: [
      `current size ${formatBytes(usage.r2StorageBytes)}`,
      `${usage.r2StorageGbMonths.toLocaleString(undefined, { maximumFractionDigits: 6 })} GB-month`,
      `${usage.r2ObjectCount.toLocaleString()} objects`,
      `Class A ${usage.r2ClassA.toLocaleString()}`,
      `Class B ${usage.r2ClassB.toLocaleString()}`,
      ...(r2ActionParts.length ? [`ops: ${r2ActionParts.join(', ')}`] : []),
    ].join(' · '),
    usd: roundUsd(r2Usd),
  });

  const d1Usd =
    billOverage(
      usage.d1RowsRead,
      included(D1_RATES.includedRowsRead),
      D1_RATES.rowsReadPerMillion / 1_000_000,
    ) +
    billOverage(
      usage.d1RowsWritten,
      included(D1_RATES.includedRowsWritten),
      D1_RATES.rowsWrittenPerMillion / 1_000_000,
    ) +
    billOverage(
      usage.d1StorageGbMonths,
      included(D1_RATES.includedStorageGb),
      D1_RATES.storagePerGbMonth,
    );
  lineItems.push({
    id: 'd1',
    label: 'D1 (clippy)',
    usageLabel: [
      `${usage.d1RowsRead.toLocaleString()} rows read`,
      `${usage.d1RowsWritten.toLocaleString()} rows written`,
      `${usage.d1ReadQueries.toLocaleString()} read queries`,
      `${usage.d1WriteQueries.toLocaleString()} write queries`,
      `current storage ${formatBytes(usage.d1StorageBytes)}`,
      `${usage.d1StorageGbMonths.toLocaleString(undefined, { maximumFractionDigits: 6 })} GB-month`,
    ].join(' · '),
    usd: roundUsd(d1Usd),
  });

  const doGbS = usage.doActiveSeconds * DO_RATES.memoryGb;
  const doUsd =
    billOverage(
      usage.doRequests,
      included(DO_RATES.includedRequests),
      DO_RATES.requestsPerMillion / 1_000_000,
    ) +
    billOverage(
      doGbS,
      included(DO_RATES.includedGbS),
      DO_RATES.durationPerMillionGbS / 1_000_000,
    ) +
    billOverage(
      usage.doRowsRead,
      included(DO_RATES.includedRowsRead),
      DO_RATES.rowsReadPerMillion / 1_000_000,
    ) +
    billOverage(
      usage.doRowsWritten,
      included(DO_RATES.includedRowsWritten),
      DO_RATES.rowsWrittenPerMillion / 1_000_000,
    ) +
    billOverage(
      usage.doStorageGbMonths,
      included(DO_RATES.includedStorageGb),
      DO_RATES.storagePerGbMonth,
    );
  const doClassParts = Object.entries(usage.doByClass).map(
    ([cls, u]) =>
      `${cls}: ${u.requests.toLocaleString()} req, ${u.activeSeconds.toLocaleString(undefined, { maximumFractionDigits: 2 })}s, ${formatBytes(u.storedBytes)}, ${u.rowsRead.toLocaleString()} rows read, ${u.rowsWritten.toLocaleString()} rows written`,
  );
  lineItems.push({
    id: 'durable_objects',
    label: 'Durable Objects (clippy)',
    usageLabel: [
      `${usage.doRequests.toLocaleString()} requests`,
      `${usage.doActiveSeconds.toLocaleString(undefined, { maximumFractionDigits: 2 })}s active`,
      `${usage.doRowsRead.toLocaleString()} rows read`,
      `${usage.doRowsWritten.toLocaleString()} rows written`,
      `stored ${formatBytes(usage.doStoredBytes)}`,
      `${usage.doStorageGbMonths.toLocaleString(undefined, { maximumFractionDigits: 6 })} GB-month`,
      ...(doClassParts.length ? doClassParts : []),
    ].join(' · '),
    usd: roundUsd(doUsd),
  });

  const c = CONTAINER_STANDARD_3;
  const memoryGiBSeconds =
    usage.containerMemoryByteSeconds > 0
      ? usage.containerMemoryByteSeconds / (1024 ** 3)
      : usage.containerActiveSeconds * c.memoryGiB;
  const diskGbSeconds =
    usage.containerDiskByteSeconds > 0
      ? usage.containerDiskByteSeconds / 1_000_000_000
      : usage.containerActiveSeconds * c.diskGb;
  const cpuSeconds =
    usage.containerCpuTimeSec > 0
      ? usage.containerCpuTimeSec
      : usage.containerActiveSeconds * c.vcpu;
  const containerEgressGb = usage.containerTxBytes / 1_000_000_000;
  const containerUsd =
    billOverage(
      memoryGiBSeconds,
      included(c.includedMemoryGiBHours * 3600),
      c.memoryPerGiBSecond,
    ) +
    billOverage(
      cpuSeconds,
      included(c.includedVcpuMinutes * 60),
      c.vcpuPerSecond,
    ) +
    billOverage(
      diskGbSeconds,
      included(c.includedDiskGbHours * 3600),
      c.diskPerGbSecond,
    ) +
    billOverage(
      containerEgressGb,
      included(c.includedEgressGb),
      c.egressPerGb,
    );
  lineItems.push({
    id: 'containers',
    label: 'Containers (clippy-clipcontainer · standard-3)',
    usageLabel: [
      `${usage.containerActiveSeconds.toLocaleString(undefined, { maximumFractionDigits: 2 })}s active wall time`,
      `${usage.containerCpuTimeSec.toLocaleString(undefined, { maximumFractionDigits: 2 })} CPU s`,
      `${memoryGiBSeconds.toLocaleString(undefined, { maximumFractionDigits: 2 })} GiB-s memory`,
      `${diskGbSeconds.toLocaleString(undefined, { maximumFractionDigits: 2 })} GB-s disk`,
      `${formatBytes(usage.containerTxBytes)} egress`,
      ...Object.entries(usage.containerTxBytesByRegion).map(
        ([region, bytes]) => `${region} ${formatBytes(bytes)}`,
      ),
      `${c.vcpu} vCPU · ${c.memoryGiB} GiB · ${c.diskGb} GB disk`,
    ].join(' · '),
    usd: roundUsd(containerUsd),
  });

  const emailUsd = billOverage(
    usage.emailSent,
    included(EMAIL_RATES.includedPerMonth),
    EMAIL_RATES.perThousand / 1000,
  );
  const emailStatusParts = Object.entries(usage.emailByStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([status, n]) => `${status}=${n.toLocaleString()}`);
  lineItems.push({
    id: 'email',
    label: 'Email Sending (clippy@)',
    usageLabel: [
      `${usage.emailSent.toLocaleString()} unique accepted (billable)`,
      ...(emailStatusParts.length ? emailStatusParts : []),
    ].join(' · '),
    usd: roundUsd(emailUsd),
  });

  const totalUsd = roundUsd(
    lineItems.filter((i) => !i.informational).reduce((s, i) => s + i.usd, 0),
  );

  return {
    period,
    days,
    billingStart: start,
    billingEnd: end,
    usage,
    lineItems,
    totalUsd,
    missingSources,
  };
}

export function emptyUsage(): UsageSnapshot {
  return {
    workersRequests: 0,
    workersCpuMs: 0,
    workersCronRequests: 0,
    workersErrors: 0,
    workersSubrequests: 0,
    r2ClassA: 0,
    r2ClassB: 0,
    r2StorageBytes: 0,
    r2StorageGbMonths: 0,
    r2ObjectCount: 0,
    r2OperationsByAction: {},
    d1RowsRead: 0,
    d1RowsWritten: 0,
    d1ReadQueries: 0,
    d1WriteQueries: 0,
    d1StorageBytes: 0,
    d1StorageGbMonths: 0,
    doRequests: 0,
    doActiveSeconds: 0,
    doRowsRead: 0,
    doRowsWritten: 0,
    doStoredBytes: 0,
    doStorageGbMonths: 0,
    doByClass: {},
    containerActiveSeconds: 0,
    containerCpuTimeSec: 0,
    containerMemoryByteSeconds: 0,
    containerDiskByteSeconds: 0,
    containerTxBytes: 0,
    containerTxBytesByRegion: {},
    emailSent: 0,
    emailByStatus: {},
  };
}
