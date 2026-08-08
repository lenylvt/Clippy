import { useState } from 'react';
import { Banner, Button, LayerCard, Text } from '@cloudflare/kumo';
import { Page } from '@/components/Page';
import { api, ApiError } from '@/lib/api';

export function OpsPage() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function run(
    op: 'stop-containers' | 'reset-queue' | 'purge-orphans',
    label: string,
  ) {
    if (!confirm(`Run ${label}?`)) return;
    setBusy(op);
    setError('');
    setMessage('');
    try {
      const res = await api<Record<string, unknown>>(`/api/admin/ops/${op}`, {
        method: 'POST',
      });
      setMessage(`${label}: ${JSON.stringify(res)}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'ops_failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Page title="Ops" description="Stop containers, reset queue, purge orphans.">
      <div className="grid gap-4">
        {error ? (
          <Banner variant="danger" title="Error">
            {error}
          </Banner>
        ) : null}
        {message ? (
          <Banner variant="success" title="Done">
            <span className="font-mono text-[0.9em]">{message}</span>
          </Banner>
        ) : null}

        <LayerCard className="px-5 py-4 ring ring-kumo-line">
          <Text className="mb-4 text-kumo-subtle">
            Prefer canceling a single job when possible. Reset queue fails all running jobs.
          </Text>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() => run('stop-containers', 'Stop containers')}
            >
              {busy === 'stop-containers' ? 'Stopping…' : 'Stop containers'}
            </Button>
            <Button
              variant="destructive"
              disabled={!!busy}
              onClick={() => run('reset-queue', 'Reset queue')}
            >
              {busy === 'reset-queue' ? 'Resetting…' : 'Reset queue'}
            </Button>
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={() => run('purge-orphans', 'Purge orphans')}
            >
              {busy === 'purge-orphans' ? 'Purging…' : 'Purge orphans'}
            </Button>
          </div>
        </LayerCard>
      </div>
    </Page>
  );
}
