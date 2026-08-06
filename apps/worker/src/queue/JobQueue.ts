import { DurableObject } from 'cloudflare:workers';
import { getContainer } from '@cloudflare/containers';
import { MAX_CONTAINER_SLOTS, clipSlotName } from '../constants';
import { stopAllClipSlots, stopClipSlot } from '../container';
import { insertClip } from '../db/clips';
import {
  claimNextQueuedJob,
  countQueuedJobs,
  getJobById,
  listActiveSlots,
  listStaleRunningJobs,
  updateJobProgress,
  updateJobStage,
} from '../db/jobs';
import { createId, sanitizeR2KeyPart } from '../http/ids';
import { canPresignR2, presignR2Put } from '../http/r2Presign';
import { notifyJobEvent } from '../notify/jobEvent';
import type { Env, JobRow } from '../types';
import { consumeProcessStream } from './processStream';

type QueueState = {
  busySlots: number[];
};

const R2_BUCKET = 'clippy-clips';

/**
 * Singleton Durable Object that assigns jobs to ClipContainer slots.
 * Keeps a slot's container warm when another job is already queued.
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

  /** Clear busy slot bookkeeping + stop idle containers (admin / recovery). */
  async resetQueue(): Promise<{ ok: boolean; stopped: number[] }> {
    await this.ctx.storage.put('state', { busySlots: [] } satisfies QueueState);
    const stopped = await stopAllClipSlots(this.env);
    this.ctx.waitUntil(this.#pump());
    return { ok: true, stopped };
  }

  /** Explicit pump trigger (cron / admin). */
  async pump(): Promise<{ ok: boolean }> {
    this.ctx.waitUntil(this.#pump());
    return { ok: true };
  }

  async alarm(): Promise<void> {
    await this.#pump();
  }

  async #pump(): Promise<void> {
    await this.#recoverStaleJobs();

    const state = (await this.ctx.storage.get<QueueState>('state')) ?? { busySlots: [] };
    const activeFromDb = await listActiveSlots(this.env);
    // Trust DB running slots over stale DO memory.
    const busy = new Set<number>(activeFromDb);

    const freeSlots: number[] = [];
    for (let i = 0; i < MAX_CONTAINER_SLOTS; i += 1) {
      if (!busy.has(i)) freeSlots.push(i);
    }

    if (freeSlots.length === 0) {
      await this.ctx.storage.put('state', { busySlots: [...busy] });
      await this.ctx.storage.setAlarm(Date.now() + 2000);
      return;
    }

    const startedSlots: number[] = [];
    for (const slot of freeSlots) {
      // Atomic claim — never start the same job twice across overlapping pumps.
      const job = await claimNextQueuedJob(this.env, slot);
      if (!job) break;

      busy.add(slot);
      startedSlots.push(slot);
      this.ctx.waitUntil(notifyJobEvent(this.env, job, 'started'));
      this.ctx.waitUntil(this.#runSlot(job, slot));
    }

    await this.ctx.storage.put('state', { busySlots: [...busy] });

    const queuedLeft = await countQueuedJobs(this.env);
    if (queuedLeft > 0 || busy.size > 0) {
      await this.ctx.storage.setAlarm(Date.now() + 3000);
    } else if (startedSlots.length === 0) {
      // Nothing running / queued — kill zombie containers sleeping in the void.
      this.ctx.waitUntil(stopAllClipSlots(this.env));
    }
  }

  /**
   * If a job died after R2 PUT (or hung), either finalize from the object or fail it.
   */
  async #recoverStaleJobs(): Promise<void> {
    const stale = await listStaleRunningJobs(this.env);
    for (const job of stale) {
      const r2Key = job.r2_key;
      try {
        if (r2Key) {
          const head = await this.env.CLIPS.head(r2Key);
          if (head && head.size >= 1024) {
            const clipId =
              job.clip_id ||
              r2Key.split('/').pop()?.replace(/\.mp4$/i, '') ||
              createId();
            await insertClip(this.env, {
              id: clipId,
              videoId: job.video_id,
              videoTitle: job.video_title,
              youtubeUrl: job.youtube_url,
              r2Key,
              clipStart: job.clip_start,
              clipEnd: job.clip_end,
              videoDuration: null,
              userId: job.user_id,
            });
            const done = await updateJobStage(this.env, job.id, {
              status: 'done',
              stage: 'done',
              progress: 1,
              clipId,
              slot: null,
              error: null,
            });
            if (done) {
              const origin =
                (await this.ctx.storage.get<string>('origin')) ||
                'https://clippy.runtimelayer.workers.dev';
              this.ctx.waitUntil(notifyJobEvent(this.env, done, 'done', { origin }));
            }
            console.log('JobQueue recovered stale job from R2', job.id, r2Key);
            continue;
          }
          await this.env.CLIPS.delete(r2Key).catch(() => undefined);
        }

        const failed = await updateJobStage(this.env, job.id, {
          status: 'error',
          stage: 'error',
          progress: 1,
          error: 'job_stale_timeout',
          slot: null,
        });
        if (failed) {
          this.ctx.waitUntil(notifyJobEvent(this.env, failed, 'error'));
        }
        console.warn('JobQueue marked stale job as error', job.id);
      } catch (error) {
        console.error('JobQueue stale recovery failed', job.id, error);
      }
    }
  }

  /** Run one or more jobs on the same warm container until the queue is empty for this path. */
  async #runSlot(firstJob: JobRow, slot: number): Promise<void> {
    const origin =
      (await this.ctx.storage.get<string>('origin')) || 'https://clippy.runtimelayer.workers.dev';
    let job: JobRow | null = firstJob;

    try {
      while (job) {
        const ok = await this.#processJob(job, slot, origin);
        if (!ok) break;

        // Claim next before stopping — keeps this container warm for the following job.
        job = await claimNextQueuedJob(this.env, slot);
        if (job) {
          this.ctx.waitUntil(notifyJobEvent(this.env, job, 'started'));
        }
      }
    } finally {
      await stopClipSlot(this.env, slot);
      const state = (await this.ctx.storage.get<QueueState>('state')) ?? { busySlots: [] };
      await this.ctx.storage.put('state', {
        busySlots: state.busySlots.filter((s) => s !== slot),
      });
      this.ctx.waitUntil(this.#pump());
    }
  }

  /** @returns true on success, false on failure */
  async #processJob(job: JobRow, slot: number, origin: string): Promise<boolean> {
    const existing = await getJobById(this.env, job.id);
    if (existing?.status === 'done') return true;
    if (existing?.status === 'error') return false;

    const clipId = createId();
    const r2Key = `clips/${sanitizeR2KeyPart(job.video_id)}/${clipId}.mp4`;

    try {
      await updateJobStage(this.env, job.id, {
        status: 'running',
        stage: 'preparing',
        progress: 0.05,
        slot,
        error: null,
        r2Key,
        clipId: null,
      });
      const preparing = await getJobById(this.env, job.id);
      if (preparing) {
        this.ctx.waitUntil(notifyJobEvent(this.env, preparing, 'progress'));
      }

      let uploadUrl: string | undefined;
      if (canPresignR2(this.env)) {
        uploadUrl = await presignR2Put({
          accountId: this.env.R2_ACCOUNT_ID!,
          accessKeyId: this.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: this.env.R2_SECRET_ACCESS_KEY!,
          bucket: R2_BUCKET,
          key: r2Key,
          contentType: 'video/mp4',
          expiresSeconds: 3600,
        });
      }

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
            ...(uploadUrl
              ? {
                  uploadUrl,
                  r2Key,
                }
              : {}),
          }),
        }),
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => 'container_failed');
        let message = errText.slice(0, 500) || `container_http_${res.status}`;
        try {
          const parsed = JSON.parse(errText) as { error?: string };
          if (parsed?.error) message = parsed.error.slice(0, 500);
        } catch {
          /* keep raw */
        }
        throw new Error(message);
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('ndjson') && !contentType.includes('json')) {
        throw new Error(`container_bad_content_type:${contentType || 'missing'}`);
      }

      let lastStage = 'preparing';
      let lastProgress = 0.05;
      let lastWriteAt = 0;

      const result = await consumeProcessStream(res, async (stage, progress) => {
        const stageChanged = stage !== lastStage;
        const progressed = progress - lastProgress >= 0.01 || progress >= 0.99;
        const now = Date.now();
        if (!stageChanged && !progressed && now - lastWriteAt < 400) return;

        lastStage = stage;
        lastProgress = progress;
        lastWriteAt = now;

        const updated = await updateJobProgress(this.env, job.id, {
          stage,
          progress,
          slot,
        });
        if (updated) {
          this.ctx.waitUntil(notifyJobEvent(this.env, updated, 'progress'));
        }
      });

      if (result.mode === 'inline') {
        if (!result.inlineBytes || result.inlineBytes.byteLength < 1024) {
          throw new Error('empty_clip');
        }
        await this.env.CLIPS.put(r2Key, result.inlineBytes, {
          httpMetadata: { contentType: 'video/mp4' },
        });
      } else {
        if (result.r2Key !== r2Key) {
          throw new Error('r2_key_mismatch');
        }
        const head = await this.env.CLIPS.head(r2Key);
        if (!head || head.size < 1024) {
          throw new Error('r2_object_missing_after_done');
        }
      }

      await insertClip(this.env, {
        id: clipId,
        videoId: job.video_id,
        videoTitle: job.video_title,
        youtubeUrl: job.youtube_url,
        r2Key,
        clipStart: job.clip_start,
        clipEnd: job.clip_end,
        videoDuration: result.videoDuration,
        userId: job.user_id,
      });

      const done = await updateJobStage(this.env, job.id, {
        status: 'done',
        stage: 'done',
        progress: 1,
        clipId,
        slot: null,
        error: null,
        r2Key,
      });
      if (done) {
        this.ctx.waitUntil(notifyJobEvent(this.env, done, 'done', { origin }));
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('JobQueue processJob failed', job.id, message);
      await this.env.CLIPS.delete(r2Key).catch(() => undefined);
      const failed = await updateJobStage(this.env, job.id, {
        status: 'error',
        stage: 'error',
        progress: 1,
        error: message.slice(0, 500),
        slot: null,
        r2Key: null,
      });
      if (failed) {
        this.ctx.waitUntil(notifyJobEvent(this.env, failed, 'error'));
      }
      return false;
    }
  }
}

export function getJobQueue(env: Env): DurableObjectStub & {
  enqueue(jobId: string, origin?: string): Promise<{ ok: boolean; slot?: number; error?: string }>;
  resetQueue(): Promise<{ ok: boolean; stopped: number[] }>;
  pump(): Promise<{ ok: boolean }>;
} {
  return env.JOB_QUEUE.get(env.JOB_QUEUE.idFromName('singleton')) as DurableObjectStub & {
    enqueue(jobId: string, origin?: string): Promise<{ ok: boolean; slot?: number; error?: string }>;
    resetQueue(): Promise<{ ok: boolean; stopped: number[] }>;
    pump(): Promise<{ ok: boolean }>;
  };
}
