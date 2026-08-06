import { api } from './client';

export function requestOtp(email: string) {
  return api<{ ok: true }>('/api/auth/request-otp', {
    method: 'POST',
    body: { email },
  });
}

export function verifyOtp(email: string, code: string) {
  return api<{ ok: true; token: string; user: { id: string; email: string } }>(
    '/api/auth/verify-otp',
    { method: 'POST', body: { email, code } },
  );
}

export function fetchMe(token: string) {
  return api<{ ok: true; user: { id: string; email: string } }>('/api/me', { token });
}

export function logout(token: string) {
  return api<{ ok: true }>('/api/auth/logout', { method: 'POST', token });
}
