import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, LayerCard, Loader, Table, Text } from '@cloudflare/kumo';
import { Page } from '@/components/Page';
import { DeleteResource } from '@/components/kumo/delete-resource/delete-resource';
import { api, ApiError } from '@/lib/api';

type Clip = {
  id: string;
  video_title: string;
  youtube_url: string;
  user_id: string | null;
  created_at: number;
  expires_at: number;
};

export function ClipsPage() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Clip | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api<{ clips: Clip[] }>('/api/admin/clips')
      .then((res) => {
        setClips(res.clips);
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
    const prev = clips;
    setClips((c) => c.filter((x) => x.id !== deleteTarget.id));
    try {
      await api(`/api/admin/clips/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
    } catch (err) {
      setClips(prev);
      setError(err instanceof ApiError ? err.code : 'delete_failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Page title="Clips" description="Delete stored clips (R2 + D1).">
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
                  <Table.Head>Title</Table.Head>
                  <Table.Head>Expires</Table.Head>
                  <Table.Head>Actions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {clips.map((clip) => (
                  <Table.Row key={clip.id}>
                    <Table.Cell>
                      <div className="grid gap-0.5">
                        <Text>{clip.video_title}</Text>
                        <span className="font-mono text-[0.9em] text-kumo-subtle">
                          {clip.id.slice(0, 8)}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {new Date(clip.expires_at).toLocaleString()}
                    </Table.Cell>
                    <Table.Cell>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setDeleteTarget(clip)}
                      >
                        Delete
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
        resourceType="Clip"
        resourceName={deleteTarget?.id ?? ''}
        onDelete={onDelete}
        isDeleting={deleting}
      />
    </Page>
  );
}
