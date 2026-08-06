import {
  MAX_UPLOAD_BYTES,
  PROCESS_STREAM_INLINE_EOF_MS,
  PROCESS_STREAM_MAX_LINE_BYTES,
} from '../constants';

export type ProcessStageEvent = {
  type: 'stage';
  stage: string;
  progress: number;
};

export type ProcessDoneEvent = {
  type: 'done';
  mode: 'r2' | 'inline';
  r2Key?: string;
  bytes: number;
  videoDuration?: number | null;
};

export type ProcessErrorEvent = {
  type: 'error';
  error: string;
};

export type ProcessEvent = ProcessStageEvent | ProcessDoneEvent | ProcessErrorEvent;

export type ProcessStreamResult = {
  mode: 'r2' | 'inline';
  r2Key?: string;
  bytes: number;
  videoDuration: number | null;
  inlineBytes?: Uint8Array;
};

export type ConsumeProcessStreamOptions = {
  signal?: AbortSignal;
  /** Cap for inline mp4 trailer (defaults to MAX_UPLOAD_BYTES). */
  maxInlineBytes?: number;
  /** Max wait for EOF after inline `done` (keep-alive safety). */
  inlineEofTimeoutMs?: number;
};

/**
 * Consume container NDJSON progress stream (+ optional trailing mp4 for inline mode).
 * Parses as bytes until the done line so the mp4 trailer is never UTF-8-decoded.
 *
 * Important: for mode=r2, return as soon as the done event arrives.
 * Do not wait for stream EOF — HTTP/1.1 keep-alive leaves the body open forever
 * after the container finishes, which stuck jobs at "uploading" ~0.97 with the
 * object already on R2.
 *
 * For mode=inline, wait for trailer bytes with a timeout (do not hang on keep-alive).
 * Unknown `mode` values reject immediately.
 */
export async function consumeProcessStream(
  res: Response,
  onStage: (stage: string, progress: number) => Promise<void> | void,
  opts: ConsumeProcessStreamOptions = {},
): Promise<ProcessStreamResult> {
  if (!res.ok) {
    throw new Error(`container_http_${res.status}`);
  }
  if (!res.body) {
    throw new Error('container_empty_body');
  }

  const signal = opts.signal;
  const maxInlineBytes = opts.maxInlineBytes ?? MAX_UPLOAD_BYTES;
  const inlineEofTimeoutMs = opts.inlineEofTimeoutMs ?? PROCESS_STREAM_INLINE_EOF_MS;

  throwIfAborted(signal);

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let buf: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let binaryMode = false;
  let expectedBytes = 0;
  let doneEvent: ProcessDoneEvent | null = null;
  const binaryChunks: Uint8Array[] = [];
  let binaryTotal = 0;
  let invalidProgressCount = 0;
  let inlineDeadline: number | null = null;

  const finishR2 = (): ProcessStreamResult => {
    if (!doneEvent?.r2Key) throw new Error('container_missing_r2_key');
    return {
      mode: 'r2',
      r2Key: doneEvent.r2Key,
      bytes: expectedBytes,
      videoDuration: normalizeDuration(doneEvent.videoDuration),
    };
  };

  const handleLine = async (lineBytes: Uint8Array): Promise<'continue' | 'r2_done'> => {
    let trimmed: string;
    try {
      trimmed = decoder.decode(lineBytes).trim();
    } catch {
      throw new Error('container_utf8_fatal');
    }
    if (!trimmed) return 'continue';

    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      throw new Error(`container_bad_event: ${trimmed.slice(0, 120)}`);
    }

    if (!raw || typeof raw !== 'object' || !('type' in raw)) {
      throw new Error(`container_unknown_event: ${trimmed.slice(0, 80)}`);
    }

    const event = raw as ProcessEvent;

    if (event.type === 'stage') {
      const progress = Number(event.progress);
      if (!Number.isFinite(progress)) {
        invalidProgressCount += 1;
        if (invalidProgressCount >= 3) {
          throw new Error('container_invalid_progress');
        }
        return 'continue';
      }
      invalidProgressCount = 0;
      if (progress < 0 || progress > 1) {
        console.debug('processStream progress out of range', progress);
      }
      await onStage(String(event.stage), Math.max(0, Math.min(1, progress)));
      return 'continue';
    }

    if (event.type === 'error') {
      throw new Error(event.error || 'container_error');
    }

    if (event.type === 'done') {
      doneEvent = event;
      const bytes = Number(event.bytes);
      if (!Number.isFinite(bytes) || bytes <= 0) {
        throw new Error('container_invalid_done_bytes');
      }
      expectedBytes = bytes;

      if (event.mode === 'r2') {
        if (!event.r2Key || typeof event.r2Key !== 'string') {
          throw new Error('container_missing_r2_key');
        }
        return 'r2_done';
      }

      if (event.mode === 'inline') {
        if (expectedBytes > maxInlineBytes) {
          throw new Error(`inline_too_large:${expectedBytes}`);
        }
        binaryMode = true;
        inlineDeadline = Date.now() + inlineEofTimeoutMs;
        return 'continue';
      }

      throw new Error(`container_unknown_done_mode:${String(event.mode)}`);
    }

    throw new Error(`container_unknown_event_type:${String((event as { type?: unknown }).type)}`);
  };

  const appendBinary = (chunk: Uint8Array) => {
    binaryTotal += chunk.byteLength;
    if (binaryTotal > maxInlineBytes) {
      throw new Error(`inline_buffer_exceeded:${binaryTotal}`);
    }
    binaryChunks.push(chunk);
  };

  try {
    while (true) {
      throwIfAborted(signal);
      if (inlineDeadline != null && Date.now() > inlineDeadline) {
        throw new Error('inline_eof_timeout');
      }

      const readPromise = reader.read();
      const { done, value } = inlineDeadline != null
        ? await raceWithDeadline(readPromise, inlineDeadline)
        : await readPromise;

      if (done) break;
      if (!value || value.byteLength === 0) continue;

      if (binaryMode) {
        appendBinary(value);
        if (expectedBytes > 0 && binaryTotal >= expectedBytes) {
          // Got enough trailer bytes — don't wait for keep-alive EOF.
          await reader.cancel().catch(() => undefined);
          break;
        }
        continue;
      }

      buf = copyToArrayBuffer(appendBytes(buf, value));
      if (buf.byteLength > PROCESS_STREAM_MAX_LINE_BYTES) {
        throw new Error(`container_line_too_long:${buf.byteLength}`);
      }

      while (!binaryMode) {
        const nl = buf.indexOf(0x0a);
        if (nl < 0) break;
        if (nl > PROCESS_STREAM_MAX_LINE_BYTES) {
          throw new Error(`container_line_too_long:${nl}`);
        }
        const line = buf.subarray(0, nl);
        buf = copyToArrayBuffer(buf.subarray(nl + 1));
        const outcome = await handleLine(line);
        if (outcome === 'r2_done') {
          await reader.cancel().catch(() => undefined);
          return finishR2();
        }
        if (binaryMode && buf.byteLength > 0) {
          appendBinary(buf);
          buf = new Uint8Array(0);
          if (expectedBytes > 0 && binaryTotal >= expectedBytes) {
            await reader.cancel().catch(() => undefined);
            break;
          }
        }
      }
      if (binaryMode && expectedBytes > 0 && binaryTotal >= expectedBytes) {
        break;
      }
    }

    if (!binaryMode && buf.byteLength > 0) {
      const outcome = await handleLine(buf);
      if (outcome === 'r2_done') {
        return finishR2();
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already cancelled / released */
    }
  }

  if (!doneEvent) {
    throw new Error('container_missing_done');
  }

  // Nested handleLine mutates doneEvent; CFA does not see those writes.
  const done = doneEvent as ProcessDoneEvent;
  const videoDuration = normalizeDuration(done.videoDuration);
  if (done.mode === 'r2') {
    return finishR2();
  }
  if (done.mode !== 'inline') {
    throw new Error(`container_unknown_done_mode:${String(done.mode)}`);
  }

  const inlineBytes = concatBytes(binaryChunks);
  if (expectedBytes > 0 && inlineBytes.byteLength !== expectedBytes) {
    throw new Error(`inline_size_mismatch:${inlineBytes.byteLength}/${expectedBytes}`);
  }
  if (inlineBytes.byteLength < 1024) {
    throw new Error('empty_clip');
  }

  return {
    mode: 'inline',
    bytes: inlineBytes.byteLength,
    videoDuration,
    inlineBytes,
  };
}

function copyToArrayBuffer(view: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(view.byteLength);
  out.set(view);
  return out;
}

function normalizeDuration(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error ? signal.reason : new Error('aborted');
  }
}

async function raceWithDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
): Promise<T> {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) throw new Error('inline_eof_timeout');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('inline_eof_timeout')), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Amortized append — grows capacity geometrically to avoid O(n²) copies. */
function appendBytes(buf: Uint8Array, chunk: Uint8Array): Uint8Array {
  const need = buf.byteLength + chunk.byteLength;
  if (buf.byteLength === 0) {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy;
  }
  const nextCap = Math.max(need, buf.byteLength * 2);
  const next = new Uint8Array(nextCap);
  next.set(buf, 0);
  next.set(chunk, buf.byteLength);
  return next.subarray(0, need);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0]!;
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
