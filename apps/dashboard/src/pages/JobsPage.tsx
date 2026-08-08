import { useCallback, useEffect, useState } from 'react';
import { Badge, Banner, Button, Input, LayerCard, Loader, Table, Text } from '@cloudflare/kumo';
import { PlusIcon } from '@phosphor-icons/react';
import { Page } from '@/components/Page';
import { DeleteResource } from '@/components/kumo/delete-resource/delete-resource';
import { api, ApiError } from '@/lib/api';

type Job = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  video_title: string;
  youtube_url: string;
  user_id: string | null;
  error: string | null;
  updated_at: number;
};

export function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({
    userId: '',
    youtubeUrl: '',
    clipStart: '0',
    clipEnd: '30',
    videoTitle: '',
  });
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const q = status ? `?status=${encodeURIComponent(status)}` : '';
    api<{ jobs: Job[] }>(`/api/admin/jobs${q}`)
      .then((res) => {
        setJobs(res.jobs);
        setError('');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api('/api/admin/jobs', {
        method: 'POST',
        body: JSON.stringify({
          userId: form.userId.trim(),
          youtubeUrl: form.youtubeUrl.trim(),
          clipStart: Number(form.clipStart),
          clipEnd: Number(form.clipEnd),
          videoTitle: form.videoTitle.trim() || undefined,
        }),
      });
      setForm((f) => ({ ...f, youtubeUrl: '', videoTitle: '' }));
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'create_failed');
    } finally {
      setCreating(false);
    }
  }

  async function cancelJob(job: Job) {
    const prev = jobs;
    setJobs((list) =>
      list.map((j) =>
        j.id === job.id
          ? { ...j, status: 'error', stage: 'error', error: 'cancelled_by_admin' }
          : j,
      ),
    );
    try {
      await api(`/api/admin/jobs/${job.id}/cancel`, { method: 'POST' });
      load();
    } catch (err) {
      setJobs(prev);
      setError(err instanceof ApiError ? err.code : 'cancel_failed');
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const prev = jobs;
    setJobs((list) => list.filter((j) => j.id !== deleteTarget.id));
    try {
      await api(`/api/admin/jobs/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
    } catch (err) {
      setJobs(prev);
      setError(err instanceof ApiError ? err.code : 'delete_failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Page title="Jobs" description="Create, cancel, or delete jobs.">
      <div className="grid gap-4">
        {error ? (
          <Banner variant="danger" title="Error">
            {error}
          </Banner>
        ) : null}

        <LayerCard className="px-5 py-4 ring ring-kumo-line">
          <Text as="h2" variant="heading3" className="mb-3">
            Create job
          </Text>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={createJob}>
            <Input
              label="User id"
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              required
            />
            <Input
              label="YouTube URL"
              value={form.youtubeUrl}
              onChange={(e) => setForm({ ...form, youtubeUrl: e.target.value })}
              required
            />
            <Input
              label="Title"
              value={form.videoTitle}
              onChange={(e) => setForm({ ...form, videoTitle: e.target.value })}
            />
            <div className="flex gap-3">
              <Input
                label="Start (s)"
                value={form.clipStart}
                onChange={(e) => setForm({ ...form, clipStart: e.target.value })}
                required
              />
              <Input
                label="End (s)"
                value={form.clipEnd}
                onChange={(e) => setForm({ ...form, clipEnd: e.target.value })}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" variant="primary" icon={<PlusIcon />} disabled={creating}>
                Enqueue
              </Button>
            </div>
          </form>
        </LayerCard>

        <div className="flex flex-wrap gap-2">
          {['', 'queued', 'running', 'done', 'error'].map((s) => (
            <Button
              key={s || 'all'}
              size="sm"
              variant={status === s ? 'primary' : 'secondary'}
              onClick={() => setStatus(s)}
            >
              {s || 'all'}
            </Button>
          ))}
        </div>

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
                  <Table.Head>Status</Table.Head>
                  <Table.Head>Progress</Table.Head>
                  <Table.Head>Actions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {jobs.map((job) => (
                  <Table.Row key={job.id}>
                    <Table.Cell>
                      <div className="grid gap-0.5">
                        <Text>{job.video_title}</Text>
                        <span className="font-mono text-[0.9em] text-kumo-subtle">
                          {job.id.slice(0, 8)}
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell>
                      <Badge>{job.status}</Badge>
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {Math.round(job.progress * 100)}%
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex flex-wrap gap-2">
                        {(job.status === 'queued' || job.status === 'running') && (
                          <Button size="sm" onClick={() => cancelJob(job)}>
                            Cancel
                          </Button>
                        )}
                        {(job.status === 'done' || job.status === 'error') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeleteTarget(job)}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
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
        resourceType="Job"
        resourceName={deleteTarget?.id ?? ''}
        onDelete={onDelete}
        isDeleting={deleting}
      />
    </Page>
  );
}
