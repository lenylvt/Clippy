const SESSION_KEY = 'clippy_admin_session';

/** Client-side session flag (HttpOnly cookie holds the real secret). */
export function getAdminToken(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setAdminToken(_token: string) {
  localStorage.setItem(SESSION_KEY, '1');
}

export function clearAdminToken() {
  localStorage.removeItem(SESSION_KEY);
}

export async function logoutAdmin(): Promise<void> {
  clearAdminToken();
  await fetch('/api/admin/logout', {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }).catch(() => undefined);
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function loginAdmin(secret: string): Promise<void> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ secret }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || data.ok === false) {
    throw new ApiError(res.status, data.error ?? 'unauthorized');
  }
  setAdminToken(secret);
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, { ...init, headers, credentials: 'include' });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  } & T;
  if (res.status === 401) {
    clearAdminToken();
  }
  if (!res.ok || data.ok === false) {
    throw new ApiError(res.status, data.error ?? 'request_failed');
  }
  return data;
}
