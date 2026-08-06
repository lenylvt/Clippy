import type { JobStage } from '../constants';

export type ProcessStageEvent = {
  type: 'stage';
  stage: JobStage | string;
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

/**
 * Consume container NDJSON progress stream (+ optional trailing mp4 for inline mode).
 * Parses as bytes until the done line so the mp4 trailer is never UTF-8-decoded.
 *
 * Important: for mode=r2, return as soon as the done event arrives.
 * Do not wait for stream EOF — HTTP/1.1 keep-alive leaves the body open forever
 * after the container finishes, which stuck jobs at "uploading" ~0.97 with the
 * object already on R2.
 */
export async function consumeProcessStream(
  res: Response,
  onStage: (stage: string, progress: number) => Promise<void> | void,
): Promise<ProcessStreamResult> {
  if (!res.body) {
    throw new Error('container_empty_body');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = new Uint8Array(0);
  let binaryMode = false;
  let expectedBytes = 0;
  let doneEvent: ProcessDoneEvent | null = null;
  const binaryChunks: Uint8Array[] = [];

  const finishR2 = (): ProcessStreamResult => {
    if (!doneEvent?.r2Key) throw new Error('container_missing_r2_key');
    const videoDuration =
      typeof doneEvent.videoDuration === 'number' && Number.isFinite(doneEvent.videoDuration)
        ? doneEvent.videoDuration
        : null;
    return {
      mode: 'r2',
      r2Key: doneEvent.r2Key,
      bytes: expectedBytes,
      videoDuration,
    };
  };

  const handleLine = async (lineBytes: Uint8Array): Promise<'continue' | 'r2_done'> => {
    const trimmed = decoder.decode(lineBytes).trim();
    if (!trimmed) return 'continue';
    let event: ProcessEvent;
    try {
      event = JSON.parse(trimmed) as ProcessEvent;
    } catch {
      throw new Error(`container_bad_event: ${trimmed.slice(0, 120)}`);
    }

    if (event.type === 'stage') {
      const progress = Number(event.progress);
      if (!Number.isFinite(progress)) return 'continue';
      await onStage(String(event.stage), Math.max(0, Math.min(1, progress)));
      return 'continue';
    }

    if (event.type === 'error') {
      throw new Error(event.error || 'container_error');
    }

    if (event.type === 'done') {
      doneEvent = event;
      expectedBytes = Number(event.bytes) || 0;
      if (event.mode === 'r2') {
        return 'r2_done';
      }
      binaryMode = true;
    }
    return 'continue';
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      if (binaryMode) {
        binaryChunks.push(value);
        continue;
      }

      buf = concatBytes([buf, value]);

      while (!binaryMode) {
        const nl = buf.indexOf(0x0a);
        if (nl < 0) break;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        const outcome = await handleLine(line);
        if (outcome === 'r2_done') {
          await reader.cancel().catch(() => undefined);
          return finishR2();
        }
        if (binaryMode && buf.byteLength > 0) {
          binaryChunks.push(buf);
          buf = new Uint8Array(0);
        }
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

  const videoDuration =
    typeof doneEvent.videoDuration === 'number' && Number.isFinite(doneEvent.videoDuration)
      ? doneEvent.videoDuration
      : null;

  if (doneEvent.mode === 'r2') {
    return finishR2();
  }

  const inlineBytes = concatBytes(binaryChunks);
  if (inlineBytes.byteLength < 1024) {
    throw new Error(
      expectedBytes > 0
        ? `inline_size_mismatch:${inlineBytes.byteLength}/${expectedBytes}`
        : 'empty_clip',
    );
  }

  return {
    mode: 'inline',
    bytes: inlineBytes.byteLength,
    videoDuration,
    inlineBytes,
  };
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
