import { Platform } from 'react-native';
import { api, type ApiOptions } from './client';
import type { Ok } from './types';

export type PushPlatform = 'ios' | 'android';

export function resolvePushPlatform(os: string = Platform.OS): PushPlatform {
  return os === 'android' ? 'android' : 'ios';
}

export type RegisterPushOpts = Pick<ApiOptions, 'signal' | 'idempotencyKey'> & {
  platform?: PushPlatform;
};

/**
 * Register an Expo push token for the signed-in user.
 * Body field `token` is the Expo push token (server contract).
 */
export function registerPushToken(
  authToken: string,
  expoPushToken: string,
  opts: RegisterPushOpts = {},
) {
  return api<Ok>('/api/me/push-token', {
    method: 'POST',
    token: authToken,
    body: {
      token: expoPushToken,
      platform: opts.platform ?? resolvePushPlatform(),
    },
    signal: opts.signal,
    idempotencyKey: opts.idempotencyKey,
  });
}

/** Remove a push token (call on sign-out when possible). */
export function unregisterPushToken(
  authToken: string,
  expoPushToken: string,
  opts?: Pick<ApiOptions, 'signal'>,
) {
  return api<Ok>('/api/me/push-token', {
    method: 'DELETE',
    token: authToken,
    body: { token: expoPushToken },
    signal: opts?.signal,
    retries: 1,
  });
}
