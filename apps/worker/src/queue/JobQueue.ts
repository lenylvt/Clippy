import { DurableObject } from 'cloudflare:workers';
import { getContainer } from '@cloudflare/containers';
import {
  CONTAINER_ACTIVITY_RENEW_MS,
  CRON_PUMP_JOB_ID,
  ERROR_MESSAGE_MAX,
  JOB_PROCESS_TIMEOUT_MS,
  MAX_CONTAINER_SLOTS,
  PROGRESS_MIN_DELTA,
  PROGRESS_WRITE_MIN_MS,
  QUEUE_WATCHDOG_MS,
  STALE_JOB_MS,
  clipSlotName,
} from '../constants';
import { stopAllClipSlots, stopClipSlot } from '../container';
import { insertClip } from '../db/clips';
import {
  claimNextQueuedJob,
  countActiveJobs,
  countQueuedJobs,
  countRunningJobs,
  failAllRunningJobs,
  getJobById,
  listRunningJobs,
  requeueOrFailJob,
  updateJobProgress,
  updateJobRunning,
  updateJobTerminal,
} from '../db/jobs';
import { createId, sanitizeR2KeyPart } from '../http/ids';
import { canPresignR2, presignR2Put } from '../http/r2Presign';
import { notifyJobEvent } from '../notify/jobEvent';
import type { Env, JobRow } from '../types';
import { consumeProcessStream } from './processStream';
import {
  isJobStale,
  isSlotClaimable,
  leaseKey,
  orphanJobAction,
  shouldIdleStopContainers,
  type SlotLease,
} from './supervisor';

const DEFAULT_R2_BUCKET = 'clippy-clips';
/** Minimum R2 object size to treat a mid-flight job as successfully uploaded. */
const R2_RECOVER_MIN_BYTES = 64 * 1024;

export type JobQueueRpc = {
  enqueue(jobId: string, origin?: string): Promise<{ ok: boolean; error?: string }>;
  resetQueue(): Promise<{ ok: boolean; stopped: number[]; failedRunning: number }>;
  pump(): Promise<{ ok: boolean }>;
};

/**
 * Singleton Durable Object that assigns jobs to ClipContainer slots.
 *
 * Concurrency model:
 * - `#pump` is single-flight (coalesced).
 * - Busy-slot truth = D1 `running` + DO leases (+ in-memory `#slotRunners` cache).
 * - Only `#pump` claims jobs; idle stop is D1-driven so DO eviction cannot SIGTERM mid-job.
 */
export class JobQueue extends DurableObject<Env> implements JobQueueRpc {
  /** Slot → in-flight runner promise (memory cache; lost on DO eviction). */
  #slotRunners = new Map<number, Promise<void>>();
  /** Coalesce overlapping pump triggers into one chain. */
  #pumpChain: Promise<void> = Promise.resolve();
  #lastRecoveryAt = 0;

  /**
   * Schedule work for `jobId`, or pump-only when `jobId === CRON_PUMP_JOB_ID`.
   */
  async enqueue(jobId: string, origin?: string): Promise<{ ok: boolean; error?: string }> {
    if (jobId !== CRON_PUMP_JOB_ID) {
      const job = await getJobById(this.env, jobId);
      if (!job) {
        return { ok: false, error: 'job_not_found' };
      }
      if (job.status !== 'queued' && job.status !== 'running') {
        return { ok: false, error: 'job_not_queueable' };
      }
      if (origin) {
        await this.ctx.storage.put(originKey(jobId), origin.replace(/\/+$/, ''));
      }
    }
    this.#schedulePump();
    return { ok: true };
  }

  /** Fail running jobs, clear leases, stop containers, then pump (admin / recovery). */
  async resetQueue(): Promise<{ ok: boolean; stopped: number[]; failedRunning: number }> {
    const failedRunning = await failAllRunningJobs(this.env, 'queue_reset');
    this.#slotRunners.clear();
    await this.#clearAllLeases();
    const stopped = await stopAllClipSlots(this.env);
    this.#schedulePump();
    return { ok: true, stopped, failedRunning };
  }

  /** Explicit pump trigger (cron / admin). */
  async pump(): Promise<{ ok: boolean }> {
    this.#schedulePump();
    return { ok: true };
  }

  async alarm(): Promise<void> {
    await this.#runPump();
  }

  #schedulePump(): void {
    this.#pumpChain = this.#pumpChain
      .then(() => this.#runPump())
      .catch((error) => {
        console.error('JobQueue pump failed', error);
      });
    this.ctx.waitUntil(this.#pumpChain);
  }

  async #runPump(): Promise<void> {
    await this.#superviseRunningJobs();

    const busySlots = await this.#busySlots();

    // Single claim path: only pump claims; skip slots owned by memory / D1 / lease.
    for (let slot = 0; slot < MAX_CONTAINER_SLOTS; slot += 1) {
      if (
        !isSlotClaimable(slot, {
          hasMemoryRunner: this.#slotRunners.has(slot),
          busySlots,
        })
      ) {
        continue;
      }

      const job = await claimNextQueuedJob(this.env, slot);
      if (!job) break;

      const run = this.#runSlot(job, slot);
      this.#slotRunners.set(slot, run);
      busySlots.add(slot);
      this.ctx.waitUntil(
        run.finally(() => {
          this.#slotRunners.delete(slot);
          this.#schedulePump();
        }),
      );
    }

    const queuedLeft = await countQueuedJobs(this.env);
    const runningLeft = await countRunningJobs(this.env);
    const leases = await this.#listLeases();
    const keepAlive = !shouldIdleStopContainers({
      queuedCount: queuedLeft,
      runningCount: runningLeft,
      leaseCount: leases.size,
      memoryRunnerCount: this.#slotRunners.size,
    });

    if (keepAlive) {
      await this.ctx.storage.setAlarm(Date.now() + QUEUE_WATCHDOG_MS);
      return;
    }

    // Idle: D1 + leases + memory all empty — safe to stop every slot.
    this.ctx.waitUntil(stopAllClipSlots(this.env));
  }

  /**
   * Watchdog for running jobs without a live in-memory runner (DO woke up).
   * R2 recover → wait on fresh heartbeat → else stop slot + requeueOrFail.
   */
  async #superviseRunningJobs(): Promise<void> {
    const now = Date.now();
    if (now - this.#lastRecoveryAt < 15_000 && this.#lastRecoveryAt > 0) return;
    this.#lastRecoveryAt = now;

    const running = await listRunningJobs(this.env);
    const runningIds = new Set(running.map((j) => j.id));

    for (const job of running) {
      const slot = job.slot;
      const hasMemoryRunner = slot != null && this.#slotRunners.has(slot);

      let r2Ready = false;
      if (!hasMemoryRunner && job.r2_key) {
        try {
          const head = await this.env.CLIPS.head(job.r2_key);
          r2Ready = !!(head && head.size >= R2_RECOVER_MIN_BYTES);
        } catch (error) {
          console.error('JobQueue R2 head failed', job.id, error);
        }
      }

      const action = orphanJobAction({
        hasMemoryRunner,
        r2Ready,
        isStale: isJobStale(job, now, STALE_JOB_MS),
      });

      if (action === null) continue;

      try {
        if (action === 'recover_r2') {
          await this.#finalizeFromR2(job);
          if (slot != null) await this.#clearLease(slot);
          continue;
        }

        if (action === 'wait') {
          if (slot != null) {
            await this.#renewSlotActivity(slot);
          }
          continue;
        }

        // requeue: stop orphaned container, clear lease, requeue or fail.
        if (slot != null) {
          await this.#clearLease(slot);
          await stopClipSlot(this.env, slot);
        }
        const outcome = await requeueOrFailJob(this.env, job.id, 'job_stale_timeout');
        if (outcome && !outcome.requeued && job.r2_key) {
          await this.env.CLIPS.delete(job.r2_key).catch(() => undefined);
        }
        console.warn(
          'JobQueue supervised stale job',
          job.id,
          'slot',
          slot,
          outcome?.requeued ? 'requeued' : 'failed',
        );
        await this.ctx.storage.delete(originKey(job.id)).catch(() => undefined);
      } catch (error) {
        console.error('JobQueue supervise failed', job.id, 'slot', slot, error);
      }
    }

    // Drop leases that no longer match a running job.
    const leases = await this.#listLeases();
    for (const [slot, lease] of leases) {
      if (!runningIds.has(lease.jobId) && !this.#slotRunners.has(slot)) {
        await this.#clearLease(slot);
      }
    }
  }

  async #finalizeFromR2(job: JobRow): Promise<void> {
    const r2Key = job.r2_key;
    if (!r2Key) return;

    const clipId =
      job.clip_id || r2Key.split('/').pop()?.replace(/\.mp4$/i, '') || createId();
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
    const done = await updateJobTerminal(this.env, job.id, {
      status: 'done',
      stage: 'done',
      progress: 1,
      clipId,
      slot: null,
      error: null,
    });
    if (done) {
      const origin = await this.#resolveOrigin(done);
      if (origin) {
        this.ctx.waitUntil(notifyJobEvent(this.env, done, 'done', { origin }));
      }
    }
    console.log('JobQueue recovered job from R2', job.id, r2Key, 'slot', job.slot);
    await this.ctx.storage.delete(originKey(job.id)).catch(() => undefined);
  }

  /** Process exactly one claimed job on `slot` (claim path stays in `#runPump`). */
  async #runSlot(job: JobRow, slot: number): Promise<void> {
    await this.#putLease(slot, { jobId: job.id, startedAt: Date.now() });
    try {
      await this.#processJob(job, slot);
    } finally {
      await this.#clearLease(slot);
      // Stop this slot only when the queue is truly idle (D1 active jobs).
      const active = await countActiveJobs(this.env);
      if (active === 0) {
        await stopClipSlot(this.env, slot);
      }
    }
  }

  async #processJob(job: JobRow, slot: number): Promise<void> {
    const existing = await getJobById(this.env, job.id);
    if (!existing) return;
    if (existing.status === 'done' || existing.status === 'error') return;
    if (existing.status !== 'running' || existing.slot !== slot) {
      console.warn('JobQueue unexpected job state at process', job.id, existing.status, existing.slot);
      return;
    }

    this.ctx.waitUntil(notifyJobEvent(this.env, existing, 'started'));

    const clipId = existing.clip_id || createId();
    const r2Key =
      existing.r2_key || `clips/${sanitizeR2KeyPart(existing.video_id)}/${clipId}.mp4`;

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(new Error('job_process_timeout')), JOB_PROCESS_TIMEOUT_MS);

    try {
      await updateJobRunning(this.env, job.id, {
        stage: 'preparing',
        progress: 0.05,
        slot,
        error: null,
        r2Key,
        // Keep prior clip_id when retrying the same artifacts.
        clipId: existing.clip_id ? existing.clip_id : null,
      });

      if (!canPresignR2(this.env)) {
        throw new Error('presign_required');
      }

      const bucket = this.env.R2_BUCKET?.trim() || DEFAULT_R2_BUCKET;
      const uploadUrl = await presignR2Put({
        accountId: this.env.R2_ACCOUNT_ID!,
        accessKeyId: this.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: this.env.R2_SECRET_ACCESS_KEY!,
        bucket,
        key: r2Key,
        contentType: 'video/mp4',
        expiresSeconds: 900,
      });

      await this.#renewSlotActivity(slot);

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
            youtubeUrl: existing.youtube_url,
            start: existing.clip_start,
            end: existing.clip_end,
            uploadUrl,
            r2Key,
          }),
          signal: ac.signal,
        }),
      );

      if (!res.ok) {
        const message = await readErrorBody(res);
        throw new Error(message);
      }

      const contentType = res.headers.get('content-type') || '';
      if (!isNdjsonContentType(contentType)) {
        throw new Error(`container_bad_content_type:${contentType || 'missing'}`);
      }

      let lastStage = 'preparing';
      let lastProgress = 0.05;
      let lastWriteAt = 0;
      let lastRenewAt = Date.now();
      let pending: { stage: string; progress: number } | null = null;
      let flushChain: Promise<void> = Promise.resolve();
      let flushScheduled = false;

      const flushProgress = () => {
        if (flushScheduled) return;
        flushScheduled = true;
        flushChain = flushChain.then(async () => {
          flushScheduled = false;
          const next = pending;
          pending = null;
          if (!next) return;
          await updateJobProgress(this.env, job.id, {
            stage: next.stage,
            progress: next.progress,
            slot,
          });
          // Progress is polled by clients — no push notify.
          if (pending) flushProgress();
        });
      };

      const result = await consumeProcessStream(
        res,
        (stage, progress) => {
          const stageChanged = stage !== lastStage;
          const progressed =
            progress - lastProgress >= PROGRESS_MIN_DELTA || progress >= 0.99;
          const now = Date.now();
          if (!stageChanged && !progressed && now - lastWriteAt < PROGRESS_WRITE_MIN_MS) {
            return;
          }
          lastStage = stage;
          lastProgress = progress;
          lastWriteAt = now;
          pending = { stage, progress };
          // Coalesce: schedule flush without blocking the stream reader.
          void flushProgress();

          if (now - lastRenewAt >= CONTAINER_ACTIVITY_RENEW_MS) {
            lastRenewAt = now;
            void this.#renewSlotActivity(slot);
          }
        },
        { signal: ac.signal },
      );

      await flushChain;

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
        if (result.bytes > 0 && head.size !== result.bytes) {
          throw new Error(`r2_size_mismatch:${head.size}/${result.bytes}`);
        }
      }

      await insertClip(this.env, {
        id: clipId,
        videoId: existing.video_id,
        videoTitle: existing.video_title,
        youtubeUrl: existing.youtube_url,
        r2Key,
        clipStart: existing.clip_start,
        clipEnd: existing.clip_end,
        videoDuration: result.videoDuration,
        userId: existing.user_id,
      });

      const done = await updateJobTerminal(this.env, job.id, {
        status: 'done',
        stage: 'done',
        progress: 1,
        clipId,
        slot: null,
        error: null,
        r2Key,
      });
      if (done) {
        const originForNotify = await this.#resolveOrigin(done);
        if (originForNotify) {
          this.ctx.waitUntil(notifyJobEvent(this.env, done, 'done', { origin: originForNotify }));
        }
      }
      await this.ctx.storage.delete(originKey(job.id)).catch(() => undefined);
    } catch (error) {
      const message = clipError(error);
      console.error('JobQueue processJob failed', job.id, message);

      if (isRetryableError(message)) {
        const outcome = await requeueOrFailJob(this.env, job.id, message);
        if (outcome?.requeued) {
          console.warn('JobQueue requeued transient failure', job.id, message);
          return;
        }
        if (outcome && !outcome.requeued) {
          await this.env.CLIPS.delete(r2Key).catch(() => undefined);
          await this.ctx.storage.delete(originKey(job.id)).catch(() => undefined);
          return;
        }
      }

      await this.env.CLIPS.delete(r2Key).catch(() => undefined);
      await updateJobTerminal(this.env, job.id, {
        status: 'error',
        stage: 'error',
        progress: 1,
        error: message,
        slot: null,
        r2Key: null,
      });
      await this.ctx.storage.delete(originKey(job.id)).catch(() => undefined);
    } finally {
      clearTimeout(timeout);
    }
  }

  async #resolveOrigin(job: JobRow): Promise<string | null> {
    const stored = await this.ctx.storage.get<string>(originKey(job.id));
    if (stored) return stored.replace(/\/+$/, '');
    if (job.origin) return job.origin.replace(/\/+$/, '');
    const pub = this.env.PUBLIC_ORIGIN?.trim();
    if (pub) return pub.replace(/\/+$/, '');
    console.warn('JobQueue missing_public_origin', job.id);
    return null;
  }

  async #putLease(slot: number, lease: SlotLease): Promise<void> {
    await this.ctx.storage.put(leaseKey(slot), lease);
  }

  async #clearLease(slot: number): Promise<void> {
    await this.ctx.storage.delete(leaseKey(slot)).catch(() => undefined);
  }

  async #clearAllLeases(): Promise<void> {
    await Promise.all(
      Array.from({ length: MAX_CONTAINER_SLOTS }, (_, slot) => this.#clearLease(slot)),
    );
  }

  async #listLeases(): Promise<Map<number, SlotLease>> {
    const out = new Map<number, SlotLease>();
    for (let slot = 0; slot < MAX_CONTAINER_SLOTS; slot += 1) {
      const lease = await this.ctx.storage.get<SlotLease>(leaseKey(slot));
      if (lease?.jobId) out.set(slot, lease);
    }
    return out;
  }

  async #busySlots(): Promise<Set<number>> {
    const busy = new Set<number>();
    for (const slot of this.#slotRunners.keys()) busy.add(slot);
    const leases = await this.#listLeases();
    for (const slot of leases.keys()) busy.add(slot);
    const running = await listRunningJobs(this.env);
    for (const job of running) {
      if (job.slot != null) busy.add(job.slot);
    }
    return busy;
  }

  async #renewSlotActivity(slot: number): Promise<void> {
    try {
      // Prefer DO namespace stub so custom RPC (renewActivity) is typed / routed.
      const stub = this.env.CLIP.get(this.env.CLIP.idFromName(clipSlotName(slot))) as unknown as {
        renewActivity(): Promise<{ ok: true }>;
      };
      await stub.renewActivity();
    } catch (error) {
      console.debug('JobQueue renewActivity failed', slot, error);
    }
  }
}

function originKey(jobId: string): string {
  return `origin:${jobId}`;
}

function clipError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, ERROR_MESSAGE_MAX);
}

function isNdjsonContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct.includes('application/x-ndjson') || ct.includes('application/ndjson');
}

function isRetryableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('timeout') ||
    m.includes('abort') ||
    m.includes('network') ||
    m.includes('econnreset') ||
    m.includes('fetch failed') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('429') ||
    m.includes('container_http_5') ||
    m.includes('temporar') ||
    m.includes('cold')
  );
}

async function readErrorBody(res: Response): Promise<string> {
  const fallback = `container_http_${res.status}`;
  try {
    const reader = res.body?.getReader();
    if (!reader) return fallback;
    const chunks: Uint8Array[] = [];
    let total = 0;
    const max = ERROR_MESSAGE_MAX * 2;
    while (total < max) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const slice = value.byteLength + total > max ? value.subarray(0, max - total) : value;
      chunks.push(slice);
      total += slice.byteLength;
      if (total >= max) break;
    }
    await reader.cancel().catch(() => undefined);
    const text = new TextDecoder().decode(concatSmall(chunks)).trim();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed?.error) return parsed.error.slice(0, ERROR_MESSAGE_MAX);
    } catch {
      /* keep raw */
    }
    return text.slice(0, ERROR_MESSAGE_MAX);
  } catch {
    return fallback;
  }
}

function concatSmall(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function getJobQueue(env: Env): DurableObjectStub<JobQueue> & JobQueueRpc {
  return env.JOB_QUEUE.get(env.JOB_QUEUE.idFromName('singleton')) as DurableObjectStub<JobQueue> &
    JobQueueRpc;
}
