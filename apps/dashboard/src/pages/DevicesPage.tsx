import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, LayerCard, Loader, Table } from '@cloudflare/kumo';
import { Page } from '@/components/Page';
import { DeleteResource } from '@/components/kumo/delete-resource/delete-resource';
import { api, ApiError } from '@/lib/api';

type Device = {
  device_token: string;
  device_id: string | null;
  user_id: string | null;
  label: string | null;
  paired_at: number | null;
};

export function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<{ devices: Device[] }>('/api/admin/devices')
      .then((res) => {
        setDevices(res.devices);
        setError('');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const id = deleteTarget.device_id ?? deleteTarget.device_token;
    const prev = devices;
    setDevices((d) => d.filter((x) => x.device_token !== deleteTarget.device_token));
    try {
      const q = deleteTarget.user_id
        ? `?userId=${encodeURIComponent(deleteTarget.user_id)}`
        : '';
      await api(`/api/admin/devices/${encodeURIComponent(id)}${q}`, {
        method: 'DELETE',
      });
      setDeleteTarget(null);
    } catch (err) {
      setDevices(prev);
      setError(err instanceof ApiError ? err.code : 'unlink_failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Page title="Devices" description="Unlink paired extensions.">
      <div className="grid gap-4">
        {error ? (
          <Banner variant="danger" title="Error">
            {error}
          </Banner>
        ) : null}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader />
          </div>
        ) : (
          <LayerCard className="overflow-hidden p-0 ring ring-kumo-line">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Label</Table.Head>
                  <Table.Head>User</Table.Head>
                  <Table.Head>Paired</Table.Head>
                  <Table.Head>Actions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {devices.map((d) => (
                  <Table.Row key={d.device_token}>
                    <Table.Cell>{d.label || 'Chrome'}</Table.Cell>
                    <Table.Cell>
                      <span className="font-mono text-[0.9em]">
                        {d.user_id?.slice(0, 8) ?? '—'}
                      </span>
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {d.paired_at ? new Date(d.paired_at).toLocaleString() : '—'}
                    </Table.Cell>
                    <Table.Cell>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteTarget(d)}
                      >
                        Unlink
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </LayerCard>
        )}
      </div>
      <DeleteResource
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        resourceType="Device"
        resourceName={
          deleteTarget?.device_id ?? deleteTarget?.device_token.slice(0, 12) ?? ''
        }
        onDelete={onDelete}
        isDeleting={deleting}
        deleteButtonText="Unlink device"
      />
    </Page>
  );
}
