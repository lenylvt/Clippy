import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Button, LayerCard, SensitiveInput, Text, Banner } from '@cloudflare/kumo';
import { api, getAdminToken, setAdminToken, ApiError } from '@/lib/api';

export function LoginPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (getAdminToken()) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const trimmed = token.trim();
    setAdminToken(trimmed);
    try {
      await api('/api/admin/overview?period=billing');
      navigate('/', { replace: true });
    } catch (err) {
      sessionStorage.removeItem('clippy_admin_token');
      setError(err instanceof ApiError ? err.code : 'login_failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <LayerCard className="w-full max-w-md px-5 py-4 ring ring-kumo-line">
        <div className="grid gap-1.5">
          <Text as="h1" variant="heading2">
            Clippy admin
          </Text>
          <Text className="text-kumo-subtle">Enter the admin secret.</Text>
        </div>
        <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
          {error ? (
            <Banner variant="danger" title="Access denied">
              {error}
            </Banner>
          ) : null}
          <SensitiveInput
            label="Admin secret"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Button
            type="submit"
            variant="primary"
            disabled={loading || token.trim().length < 16}
          >
            {loading ? 'Checking…' : 'Continue'}
          </Button>
        </form>
      </LayerCard>
    </div>
  );
}
