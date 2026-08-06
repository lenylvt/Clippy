import { deletePushToken } from '../db/push';
import type { Env } from '../types';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_CHUNK = 100;
export const EXPO_PUSH_TIMEOUT_MS = 15_000;
export const EXPO_PUSH_MAX_ATTEMPTS = 3;

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  channelId?: string;
  collapseId?: string;
  ttl?: number;
  interruptionLevel?: 'active' | 'passive' | 'timeSensitive';
  _contentAvailable?: boolean;
  priority?: 'default' | 'normal' | 'high';
};

type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string; expoPushToken?: string };
};

type ExpoSendResponse = {
  data?: ExpoTicket | ExpoTicket[];
  errors?: Array<{ code?: string; message?: string }>;
};

function chunkMessages<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function backoffMs(attempt: number): number {
  const base = 400 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 200);
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asTicketArray(data: ExpoSendResponse['data']): ExpoTicket[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/** Map Expo tickets (same order as messages) → tokens to purge. */
export function tokensToPurgeFromTickets(
  messages: ExpoMessage[],
  tickets: ExpoTicket[],
): string[] {
  const doomed = new Set<string>();
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]!;
    if (ticket.status !== 'error') continue;
    if (ticket.details?.error !== 'DeviceNotRegistered') continue;
    const fromDetails = ticket.details.expoPushToken;
    const fromMessage = messages[i]?.to;
    const token = fromDetails || fromMessage;
    if (token) doomed.add(token);
  }
  return [...doomed];
}

function buildHeaders(env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
    'User-Agent': 'Clippy-Worker/0.3',
  };
  const accessToken = env.EXPO_ACCESS_TOKEN?.trim();
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return headers;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function sendChunkOnce(
  env: Env,
  messages: ExpoMessage[],
): Promise<{ ok: boolean; retryable: boolean; tickets: ExpoTicket[]; status: number }> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: buildHeaders(env),
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(EXPO_PUSH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('expo push http error', {
      status: res.status,
      body: text.slice(0, 500),
      count: messages.length,
    });
    return { ok: false, retryable: isRetryableStatus(res.status), tickets: [], status: res.status };
  }

  let json: ExpoSendResponse;
  try {
    json = (await res.json()) as ExpoSendResponse;
  } catch (error) {
    console.error('expo push invalid json', error);
    return { ok: false, retryable: true, tickets: [], status: res.status };
  }

  if (json.errors?.length) {
    console.error('expo push request errors', json.errors);
  }

  const tickets = asTicketArray(json.data);
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i]!;
    if (ticket.status === 'error') {
      console.error('expo push ticket error', {
        tokenSuffix: messages[i]?.to?.slice(-12),
        message: ticket.message,
        error: ticket.details?.error,
      });
    }
  }

  return { ok: true, retryable: false, tickets, status: res.status };
}

async function sendChunkWithRetry(env: Env, messages: ExpoMessage[]): Promise<string[]> {
  let lastTickets: ExpoTicket[] = [];

  for (let attempt = 0; attempt < EXPO_PUSH_MAX_ATTEMPTS; attempt++) {
    try {
      const result = await sendChunkOnce(env, messages);
      if (result.ok) {
        lastTickets = result.tickets;
        break;
      }
      if (!result.retryable || attempt === EXPO_PUSH_MAX_ATTEMPTS - 1) {
        break;
      }
    } catch (error) {
      console.error('expo push network error', {
        attempt,
        count: messages.length,
        error,
      });
      if (attempt === EXPO_PUSH_MAX_ATTEMPTS - 1) break;
    }
    await sleep(backoffMs(attempt));
  }

  return tokensToPurgeFromTickets(messages, lastTickets);
}

/**
 * Send Expo push messages in ≤100 chunks with timeout, retry on 429/5xx/network,
 * and purge DeviceNotRegistered tokens.
 */
export async function sendExpoPush(env: Env, messages: ExpoMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const toDelete = new Set<string>();
  for (const batch of chunkMessages(messages, EXPO_PUSH_CHUNK)) {
    const doomed = await sendChunkWithRetry(env, batch);
    for (const token of doomed) toDelete.add(token);
  }

  for (const token of toDelete) {
    try {
      await deletePushToken(env, token);
      console.log('expo push purged DeviceNotRegistered token', token.slice(-12));
    } catch (error) {
      console.error('expo push purge failed', { tokenSuffix: token.slice(-12), error });
    }
  }
}
