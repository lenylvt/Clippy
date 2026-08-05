import { Container, getContainer } from '@cloudflare/containers';
import { MAX_CONTAINER_SLOTS, clipSlotName } from './constants';
import type { Env } from './types';

/** One clip processor per slot. Stopped explicitly after each job; sleepAfter is a safety net. */
export class ClipContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '10s';
  enableInternet = true;
  pingEndpoint = 'localhost/health';

  override onStart(): void {
    console.log('ClipContainer started');
  }

  override onStop(): void {
    console.log('ClipContainer stopped');
  }

  override onError(error: unknown): void {
    console.error('ClipContainer error', error);
  }

  /** Force destroy on idle — stop() alone is unreliable on some platform versions. */
  override async onActivityExpired(): Promise<void> {
    console.log('ClipContainer activity expired, destroying');
    try {
      await this.destroy();
    } catch (error) {
      console.error('ClipContainer destroy failed', error);
      await this.stop().catch(() => undefined);
    }
  }
}

/** Stop a slot's container if it is still running. */
export async function stopClipSlot(env: Env, slot: number): Promise<void> {
  // Env binding is untyped DO namespace; getContainer expects Container subclass.
  const container = getContainer(env.CLIP as never, clipSlotName(slot));
  try {
    await container.destroy();
  } catch (error) {
    console.error('stopClipSlot destroy failed', slot, error);
    try {
      await container.stop();
    } catch (stopError) {
      console.error('stopClipSlot stop failed', slot, stopError);
    }
  }
}

/** Stop every configured slot (cleanup for stuck instances). */
export async function stopAllClipSlots(env: Env): Promise<number[]> {
  const stopped: number[] = [];
  for (let slot = 0; slot < MAX_CONTAINER_SLOTS; slot += 1) {
    await stopClipSlot(env, slot);
    stopped.push(slot);
  }
  return stopped;
}
