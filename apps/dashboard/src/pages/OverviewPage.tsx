import { useEffect, useState } from 'react';
import { Badge, Banner, Button, LayerCard, Loader, Table, Text } from '@cloudflare/kumo';
import { Page } from '@/components/Page';
import { api } from '@/lib/api';

type Period = 'billing' | 'today' | '7d' | '30d';

type CostLine = {
  id: string;
  label: string;
  usageLabel: string;
  usd: number;
  informational?: boolean;
};

type DoClassUsage = {
  requests: number;
  activeSeconds: number;
  storedBytes: number;
  rowsRead: number;
  rowsWritten: number;
};

type Usage = {
  workersRequests: number;
  workersCpuMs: number;
  workersCronRequests: number;
  workersErrors: number;
  workersSubrequests: number;
  r2ClassA: number;
  r2ClassB: number;
  r2StorageBytes: number;
  r2StorageGbMonths: number;
  r2ObjectCount: number;
  r2OperationsByAction: Record<string, number>;
  d1RowsRead: number;
  d1RowsWritten: number;
  d1ReadQueries: number;
  d1WriteQueries: number;
  d1StorageBytes: number;
  d1StorageGbMonths: number;
  doRequests: number;
  doActiveSeconds: number;
  doRowsRead: number;
  doRowsWritten: number;
  doStoredBytes: number;
  doStorageGbMonths: number;
  doByClass: Record<string, DoClassUsage>;
  containerActiveSeconds: number;
  containerCpuTimeSec: number;
  containerMemoryByteSeconds: number;
  containerDiskByteSeconds: number;
  containerTxBytes: number;
  containerTxBytesByRegion: Record<string, number>;
  emailSent: number;
  emailByStatus: Record<string, number>;
};

type Overview = {
  counts: {
    users: number;
    jobs: number;
    clips: number;
    devices: number;
    activeJobs: number;
  };
  costs: {
    period: Period;
    totalUsd: number;
    missingSources: string[];
    billingStart: number;
    billingEnd: number;
    days: number;
    lineItems: CostLine[];
    usage: Usage;
  };
};

function fmtBytes(bytes: number): string {
  const n = Math.max(0, bytes);
  if (n < 1000) return `${n} B`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)} kB`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)} MB`;
  return `${(n / 1_000_000_000).toFixed(3)} GB`;
}

function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export function OverviewPage() {
  const [period, setPeriod] = useState<Period>('billing');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<Overview>(`/api/admin/overview?period=${period}`)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError('');
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  return (
    <Page title="Overview">
      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            ['billing', 'Billing cycle'],
            ['today', 'Today'],
            ['7d', '7 days'],
            ['30d', '30 days'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={period === value ? 'primary' : 'secondary'}
            onClick={() => setPeriod(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {error ? (
        <Banner variant="error" title="Failed to load">
          {error}
        </Banner>
      ) : null}

      {loading || !data ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ['Users', data.counts.users],
                ['Jobs', data.counts.jobs],
                ['Active jobs', data.counts.activeJobs],
                ['Clips', data.counts.clips],
                ['Devices', data.counts.devices],
              ] as const
            ).map(([label, value]) => (
              <LayerCard key={label} className="px-5 py-4 ring ring-kumo-line">
                <Text className="text-kumo-subtle">{label}</Text>
                <Text as="p" variant="heading2" className="tabular-nums">
                  {value}
                </Text>
              </LayerCard>
            ))}
          </div>

          {data.costs.missingSources.length > 0 ? (
            <Banner variant="alert" title="Some metrics are estimated or unavailable">
              {data.costs.missingSources.join(', ')}
            </Banner>
          ) : null}

          <LayerCard className="px-5 py-4 ring ring-kumo-line">
            <Text as="h2" variant="heading3" className="mb-3">
              Attributed Clippy overage
            </Text>
            <Text as="p" className="text-kumo-subtle mb-2">
              Stack-only estimate after included quotas — not the account invoice.
            </Text>
            <Text as="p" variant="heading1" className="tabular-nums">
              ${data.costs.totalUsd.toFixed(4)}
            </Text>
          </LayerCard>

          <UsageSection usage={data.costs.usage} />

          <LayerCard className="overflow-hidden p-0 ring ring-kumo-line">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Product</Table.Head>
                  <Table.Head>Usage</Table.Head>
                  <Table.Head>Estimate</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data.costs.lineItems.map((row) => (
                  <Table.Row key={row.id}>
                    <Table.Cell>
                      {row.label}
                      {row.informational ? (
                        <Badge className="ml-2">info</Badge>
                      ) : null}
                    </Table.Cell>
                    <Table.Cell>
                      <span className="font-mono text-[0.9em] whitespace-pre-wrap break-all">
                        {row.usageLabel}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {row.informational ? '—' : `$${row.usd.toFixed(4)}`}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </LayerCard>
        </div>
      )}
    </Page>
  );
}

function UsageSection({ usage }: { usage: Usage }) {
  const r2Actions = Object.entries(usage.r2OperationsByAction).sort(
    (a, b) => b[1] - a[1],
  );
  const doClasses = Object.entries(usage.doByClass);

  return (
    <div className="grid gap-4">
      <LayerCard className="px-5 py-4 ring ring-kumo-line">
        <Text as="h2" variant="heading3" className="mb-3">
          Workers (clippy)
        </Text>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Requests" value={fmtNum(usage.workersRequests)} />
          <Metric label="CPU time" value={`${fmtNum(usage.workersCpuMs, 2)} ms`} />
          <Metric label="Errors" value={fmtNum(usage.workersErrors)} />
          <Metric label="Subrequests" value={fmtNum(usage.workersSubrequests)} />
          <Metric label="Cron invocations" value={fmtNum(usage.workersCronRequests)} />
        </div>
      </LayerCard>

      <LayerCard className="px-5 py-4 ring ring-kumo-line">
        <Text as="h2" variant="heading3" className="mb-3">
          R2 (clippy-clips)
        </Text>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Current bucket size" value={fmtBytes(usage.r2StorageBytes)} />
          <Metric label="Billable storage" value={`${fmtNum(usage.r2StorageGbMonths, 6)} GB-month`} />
          <Metric label="Objects" value={fmtNum(usage.r2ObjectCount)} />
          <Metric label="Class A operations" value={fmtNum(usage.r2ClassA)} />
          <Metric label="Class B operations" value={fmtNum(usage.r2ClassB)} />
        </div>
        {r2Actions.length > 0 ? (
          <div className="mt-3 grid gap-1.5">
            <Text className="text-kumo-subtle">Operations by actionType</Text>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {r2Actions.map(([action, n]) => (
                <Metric key={action} label={action} value={fmtNum(n)} />
              ))}
            </div>
          </div>
        ) : null}
      </LayerCard>

      <LayerCard className="px-5 py-4 ring ring-kumo-line">
        <Text as="h2" variant="heading3" className="mb-3">
          D1 (clippy)
        </Text>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Rows read" value={fmtNum(usage.d1RowsRead)} />
          <Metric label="Rows written" value={fmtNum(usage.d1RowsWritten)} />
          <Metric label="Read queries" value={fmtNum(usage.d1ReadQueries)} />
          <Metric label="Write queries" value={fmtNum(usage.d1WriteQueries)} />
          <Metric label="Current storage" value={fmtBytes(usage.d1StorageBytes)} />
          <Metric
            label="Billable storage"
            value={`${fmtNum(usage.d1StorageGbMonths, 6)} GB-month`}
          />
        </div>
      </LayerCard>

      <LayerCard className="px-5 py-4 ring ring-kumo-line">
        <Text as="h2" variant="heading3" className="mb-3">
          Durable Objects (clippy)
        </Text>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Requests" value={fmtNum(usage.doRequests)} />
          <Metric
            label="Active time"
            value={`${fmtNum(usage.doActiveSeconds, 2)} s`}
          />
          <Metric label="SQL rows read" value={fmtNum(usage.doRowsRead)} />
          <Metric label="SQL rows written" value={fmtNum(usage.doRowsWritten)} />
          <Metric label="Current stored" value={fmtBytes(usage.doStoredBytes)} />
          <Metric
            label="Billable storage"
            value={`${fmtNum(usage.doStorageGbMonths, 6)} GB-month`}
          />
        </div>
        {doClasses.length > 0 ? (
          <div className="mt-3 grid gap-3">
            <Text className="text-kumo-subtle">By class</Text>
            {doClasses.map(([cls, u]) => (
              <div key={cls} className="grid gap-1.5">
                <Text className="font-medium">{cls}</Text>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Metric label="Requests" value={fmtNum(u.requests)} />
                  <Metric
                    label="Active time"
                    value={`${fmtNum(u.activeSeconds, 2)} s`}
                  />
                  <Metric label="Stored" value={fmtBytes(u.storedBytes)} />
                  <Metric label="Rows read" value={fmtNum(u.rowsRead)} />
                  <Metric label="Rows written" value={fmtNum(u.rowsWritten)} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </LayerCard>

      <LayerCard className="px-5 py-4 ring ring-kumo-line">
        <Text as="h2" variant="heading3" className="mb-3">
          Containers (clippy-clipcontainer · standard-3)
        </Text>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Metric
            label="Active wall time"
            value={`${fmtNum(usage.containerActiveSeconds, 2)} s`}
          />
          <Metric
            label="CPU time"
            value={`${fmtNum(usage.containerCpuTimeSec, 2)} s`}
          />
          <Metric
            label="Allocated memory"
            value={`${fmtNum(usage.containerMemoryByteSeconds / 1024 ** 3, 2)} GiB-s`}
          />
          <Metric
            label="Allocated disk"
            value={`${fmtNum(usage.containerDiskByteSeconds / 1_000_000_000, 2)} GB-s`}
          />
          <Metric label="Egress (tx)" value={fmtBytes(usage.containerTxBytes)} />
          {Object.entries(usage.containerTxBytesByRegion).map(([region, bytes]) => (
            <Metric key={region} label={`Egress ${region}`} value={fmtBytes(bytes)} />
          ))}
          <Metric label="Instance" value="2 vCPU · 8 GiB · 16 GB disk" />
        </div>
      </LayerCard>

      <LayerCard className="px-5 py-4 ring ring-kumo-line">
        <Text as="h2" variant="heading3" className="mb-3">
          Email Sending
        </Text>
        <div className="grid gap-2 sm:grid-cols-2">
          <Metric label="Unique accepted (billable)" value={fmtNum(usage.emailSent)} />
          {Object.entries(usage.emailByStatus).map(([status, count]) => (
            <Metric key={status} label={status} value={fmtNum(count)} />
          ))}
        </div>
      </LayerCard>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="grid gap-0.5">
      <Text className="text-kumo-subtle">{label}</Text>
      <Text className="font-medium tabular-nums font-mono text-[0.9em]">{value}</Text>
    </div>
  );
}
