import { Container, getContainer } from '@cloudflare/containers';
import {
  CONTAINER_PORT,
  MAX_CONTAINER_SLOTS,
  clipSlotName,
} from './constants';
import { requireContainerSecret, type Env } from './types';

/** Clip processor DO — stopped after each job; sleepAfter is a long safety net. */
export class ClipContainer extends Container {
  defaultPort = CONTAINER_PORT;
  /** Longer than worst-case download+crop+upload so platform idle kill doesn't SIGKILL mid-job. */
  sleepAfter = '20m';
  enableInternet = true;
  /** Matches container `/health` (also serves `/ping`). */
  pingEndpoint = 'localhost/health';

  /**
   * Forward Worker secret into the Python process so `/process` can
   * constant-time-check `X-Clippy-Internal`.
   */
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx as never, env);
    this.envVars = { CONTAINER_SECRET: requireContainerSecret(env) };
  }

  override onStart(): void {
    console.log('ClipContainer started');
  }

  override onStop(params?: { exitCode?: number; reason?: string }): void {
    console.log('ClipContainer stopped', {
      exitCode: params?.exitCode,
      reason: params?.reason,
    });
  }

  override onError(error: unknown): void {
    console.error('ClipContainer error', error);
    throw error;
  }

  /** Graceful stop first; destroy only if stop fails. */
  override async onActivityExpired(): Promise<void> {
    console.log('ClipContainer activity expired, stopping');
    try {
      await this.stop();
    } catch (stopError) {
      console.error('ClipContainer stop on expiry failed, destroying', stopError);
      try {
        await this.destroy();
      } catch (destroyError) {
        console.error('ClipContainer destroy on expiry failed', destroyError);
      }
    }
  }

  /** RPC from JobQueue — keep sleepAfter alive during long /process streams. */
  async renewActivity(): Promise<{ ok: true }> {
    this.renewActivityTimeout();
    return { ok: true };
  }
}

export function getClipContainer(env: Env, slot: number) {
  return getContainer(
    env.CLIP as unknown as DurableObjectNamespace<ClipContainer>,
    clipSlotName(slot),
  );
}

/** Stop a slot's container if it is still running (stop → destroy fallback). */
export async function stopClipSlot(env: Env, slot: number): Promise<boolean> {
  const container = getClipContainer(env, slot);
  try {
    await container.stop();
    return true;
  } catch (stopError) {
    console.error('stopClipSlot stop failed', { slot, err: stopError });
    try {
      await container.destroy();
      return true;
    } catch (destroyError) {
      console.error('stopClipSlot destroy failed', { slot, err: destroyError });
      return false;
    }
  }
}

/** Stop every configured slot in parallel; returns slots that stopped successfully. */
export async function stopAllClipSlots(env: Env): Promise<number[]> {
  const slots = Array.from({ length: MAX_CONTAINER_SLOTS }, (_, slot) => slot);
  const results = await Promise.allSettled(
    slots.map(async (slot) => {
      const ok = await stopClipSlot(env, slot);
      if (!ok) throw new Error(`stop_failed:${slot}`);
      return slot;
    }),
  );
  const stopped: number[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') stopped.push(result.value);
  }
  return stopped;
}
