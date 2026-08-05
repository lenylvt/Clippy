import { DurableObject } from 'cloudflare:workers';
import { getContainer } from '@cloudflare/containers';
import { MAX_CONTAINER_SLOTS, clipSlotName } from './constants';
import { stopClipSlot } from './container';
import {
  insertClip,
  listActiveSlots,
  listQueuedJobs,
  updateJobStage,
} from './db';
import { createId, sanitizeR2KeyPart } from './http';
import type { Env, JobRow } from './types';

type QueueState = {
  busySlots: number[];
};

/**
 * Singleton Durable Object that assigns jobs to ClipContainer slots.
 */
export class JobQueue extends DurableObject<Env> {
  async enqueue(jobId: string, _origin?: string): Promise<{ ok: boolean; slot?: number; error?: string }> {
    await this.ctx.storage.put('lastEnqueue', Date.now());
    if (_origin) {
      await this.ctx.storage.put('origin', _origin);
    }
    this.ctx.waitUntil(this.#pump());
    return { ok: true };
  }

  async alarm(): Promise<void> {
    await this.#pump();
  }

  async #pump(): Promise<void> {
    const state = (await this.ctx.storage.get<QueueState>('state')) ?? { busySlots: [] };
    const activeFromDb = await listActiveSlots(this.env);
    const busy = new Set<number>([...state.busySlots, ...activeFromDb]);

    const freeSlots: number[] = [];
    for (let i = 0; i < MAX_CONTAINER_SLOTS; i += 1) {
      if (!busy.has(i)) freeSlots.push(i);
    }

    if (freeSlots.length === 0) {
      await this.ctx.storage.setAlarm(Date.now() + 2000);
      return;
    }

    const queued = await listQueuedJobs(this.env, freeSlots.length);
    for (let i = 0; i < queued.length && i < freeSlots.length; i += 1) {
      const job = queued[i]!;
      const slot = freeSlots[i]!;
      busy.add(slot);
      await updateJobStage(this.env, job.id, {
        status: 'running',
        stage: 'downloading',
        progress: 0.02,
        slot,
        error: null,
      });
      this.ctx.waitUntil(this.#runJob(job, slot));
    }

    await this.ctx.storage.put('state', { busySlots: [...busy] });
    const stillQueued = await listQueuedJobs(this.env, 1);
    // Only re-alarm for queued work. Running jobs re-enter via #runJob finally.
    // Alarming while busySlots>0 kept JobQueue warm forever when state went stale.
    if (stillQueued.length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + 3000);
    }
  }

  async #runJob(job: JobRow, slot: number): Promise<void> {
    const origin =
      (await this.ctx.storage.get<string>('origin')) || 'https://clippy.runtimelayer.workers.dev';
    try {
      await updateJobStage(this.env, job.id, {
        status: 'running',
        stage: 'downloading',
        progress: 0.05,
        slot,
        error: null,
      });

      const container = getContainer(this.env.CLIP as never, clipSlotName(slot));
      const processUrl = new URL('http://container/process');
      const res = await container.fetch(
        new Request(processUrl.toString(), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-Clippy-Internal': this.env.CONTAINER_SECRET,
          },
          body: JSON.stringify({
            jobId: job.id,
            youtubeUrl: job.youtube_url,
            start: job.clip_start,
            end: job.clip_end,
            callbackBase: origin,
            secret: this.env.CONTAINER_SECRET,
          }),
        }),
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => 'container_failed');
        throw new Error(errText.slice(0, 500) || `container_http_${res.status}`);
      }

      const contentType = res.headers.get('content-type') || 'video/mp4';
      if (!contentType.includes('video/') && !contentType.includes('octet-stream')) {
        // JSON error from container
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || 'container_bad_response');
      }

      await updateJobStage(this.env, job.id, {
        stage: 'uploading',
        progress: 0.9,
      });

      const bytes = await res.arrayBuffer();
      if (bytes.byteLength < 1024) {
        throw new Error('empty_clip');
      }

      const clipId = createId();
      const r2Key = `clips/${sanitizeR2KeyPart(job.video_id)}/${clipId}.mp4`;
      await this.env.CLIPS.put(r2Key, bytes, {
        httpMetadata: { contentType: 'video/mp4' },
      });

      await insertClip(this.env, {
        id: clipId,
        videoId: job.video_id,
        videoTitle: job.video_title,
        youtubeUrl: job.youtube_url,
        r2Key,
        clipStart: job.clip_start,
        clipEnd: job.clip_end,
      });

      await updateJobStage(this.env, job.id, {
        status: 'done',
        stage: 'done',
        progress: 1,
        clipId,
        slot: null,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('JobQueue runJob failed', job.id, message);
      await updateJobStage(this.env, job.id, {
        status: 'error',
        stage: 'error',
        progress: 1,
        error: message.slice(0, 500),
        slot: null,
      });
    } finally {
      // Explicit stop — sleepAfter alone does not reliably shut down instances.
      await stopClipSlot(this.env, slot);
      const state = (await this.ctx.storage.get<QueueState>('state')) ?? { busySlots: [] };
      await this.ctx.storage.put('state', {
        busySlots: state.busySlots.filter((s) => s !== slot),
      });
      this.ctx.waitUntil(this.#pump());
    }
  }
}

export function getJobQueue(env: Env): DurableObjectStub & {
  enqueue(jobId: string, origin?: string): Promise<{ ok: boolean; slot?: number; error?: string }>;
} {
  return env.JOB_QUEUE.get(env.JOB_QUEUE.idFromName('singleton')) as DurableObjectStub & {
    enqueue(jobId: string, origin?: string): Promise<{ ok: boolean; slot?: number; error?: string }>;
  };
}
