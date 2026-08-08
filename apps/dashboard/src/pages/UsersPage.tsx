import { useCallback, useEffect, useState } from 'react';
import { Button, Input, LayerCard, Loader, Table, Banner } from '@cloudflare/kumo';
import { PlusIcon } from '@phosphor-icons/react';
import { Page } from '@/components/Page';
import { DeleteResource } from '@/components/kumo/delete-resource/delete-resource';
import { api, ApiError } from '@/lib/api';

type UserRow = {
  id: string;
  email: string;
  created_at: number;
  jobs_count: number;
  clips_count: number;
  devices_count: number;
};

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api<{ users: UserRow[] }>('/api/admin/users')
      .then((res) => {
        setUsers(res.users);
        setError('');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setEmail('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'create_failed');
    } finally {
      setCreating(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    const prev = users;
    setUsers((u) => u.filter((x) => x.id !== deleteTarget.id));
    try {
      await api(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
    } catch (err) {
      setUsers(prev);
      setDeleteError(err instanceof ApiError ? err.code : 'delete_failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Page title="Users" description="Create or delete users.">
      <div className="grid gap-4">
        {error ? (
          <Banner variant="danger" title="Error">
            {error}
          </Banner>
        ) : null}

        <LayerCard className="px-5 py-4 ring ring-kumo-line">
          <form className="flex flex-wrap items-end gap-3" onSubmit={createUser}>
            <div className="min-w-[220px] grow">
              <Input
                label="New user email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" variant="primary" icon={<PlusIcon />} disabled={creating}>
              Create
            </Button>
          </form>
        </LayerCard>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader />
          </div>
        ) : (
          <LayerCard className="overflow-hidden p-0 ring ring-kumo-line">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Email</Table.Head>
                  <Table.Head>Jobs</Table.Head>
                  <Table.Head>Clips</Table.Head>
                  <Table.Head>Devices</Table.Head>
                  <Table.Head>Actions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {users.map((u) => (
                  <Table.Row key={u.id}>
                    <Table.Cell>{u.email}</Table.Cell>
                    <Table.Cell className="tabular-nums">{u.jobs_count}</Table.Cell>
                    <Table.Cell className="tabular-nums">{u.clips_count}</Table.Cell>
                    <Table.Cell className="tabular-nums">{u.devices_count}</Table.Cell>
                    <Table.Cell>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteTarget(u)}
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
        resourceType="User"
        resourceName={deleteTarget?.email ?? ''}
        onDelete={onDelete}
        isDeleting={deleting}
        errorMessage={deleteError}
      />
    </Page>
  );
}
