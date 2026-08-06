import { api } from './client';

export function registerPushToken(token: string, pushToken: string) {
  return api<{ ok: true }>('/api/me/push-token', {
    method: 'POST',
    token,
    body: {
      token: pushToken,
      platform: 'ios',
    },
  });
}
