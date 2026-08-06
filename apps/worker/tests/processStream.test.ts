import { describe, expect, it } from 'vitest';
import { consumeProcessStream } from '../src/queue/processStream';

function ndjsonResponse(lines: string[], trailer?: Uint8Array): Response {
  const text = lines.map((l) => (l.endsWith('\n') ? l : `${l}\n`)).join('');
  const prefix = new TextEncoder().encode(text);
  const body = trailer ? concat(prefix, trailer) : prefix;
  return new Response(Uint8Array.from(body), {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  });
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

describe('consumeProcessStream', () => {
  it('applique stage + progress précis puis done r2', async () => {
    const stages: Array<{ stage: string; progress: number }> = [];
    const res = ndjsonResponse([
      JSON.stringify({ type: 'stage', stage: 'downloading', progress: 0.12 }),
      JSON.stringify({ type: 'stage', stage: 'downloading', progress: 0.33 }),
      JSON.stringify({ type: 'stage', stage: 'cropping', progress: 0.66 }),
      JSON.stringify({ type: 'stage', stage: 'uploading', progress: 0.9 }),
      JSON.stringify({
        type: 'done',
        mode: 'r2',
        r2Key: 'clips/abc/1.mp4',
        bytes: 4096,
        videoDuration: 123.4,
      }),
    ]);

    const result = await consumeProcessStream(res, (stage, progress) => {
      stages.push({ stage, progress });
    });

    expect(stages).toEqual([
      { stage: 'downloading', progress: 0.12 },
      { stage: 'downloading', progress: 0.33 },
      { stage: 'cropping', progress: 0.66 },
      { stage: 'uploading', progress: 0.9 },
    ]);
    expect(result.mode).toBe('r2');
    expect(result.r2Key).toBe('clips/abc/1.mp4');
    expect(result.bytes).toBe(4096);
    expect(result.videoDuration).toBe(123.4);
  });

  it('lit le trailer mp4 inline sans corrompre les bytes', async () => {
    const mp4 = new Uint8Array(2048);
    mp4[0] = 0xff;
    mp4[1] = 0xd8;
    mp4[100] = 0x00;
    mp4[101] = 0x0a; // newline inside binary must not split events
    mp4[2047] = 0x42;

    const res = ndjsonResponse(
      [
        JSON.stringify({ type: 'stage', stage: 'uploading', progress: 0.97 }),
        JSON.stringify({ type: 'done', mode: 'inline', bytes: 2048, videoDuration: null }),
      ],
      mp4,
    );

    const result = await consumeProcessStream(res, () => undefined);
    expect(result.mode).toBe('inline');
    expect(result.inlineBytes?.byteLength).toBe(2048);
    expect(result.inlineBytes?.[0]).toBe(0xff);
    expect(result.inlineBytes?.[101]).toBe(0x0a);
    expect(result.inlineBytes?.[2047]).toBe(0x42);
  });

  it('propage error NDJSON', async () => {
    const res = ndjsonResponse([
      JSON.stringify({ type: 'stage', stage: 'downloading', progress: 0.1 }),
      JSON.stringify({ type: 'error', error: 'yt-dlp boom' }),
    ]);
    await expect(consumeProcessStream(res, () => undefined)).rejects.toThrow('yt-dlp boom');
  });

  it('termine dès le done r2 même si le flux HTTP ne se ferme jamais', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: 'stage', stage: 'uploading', progress: 0.97 })}\n`,
          ),
        );
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: 'done',
              mode: 'r2',
              r2Key: 'clips/abc/keep-alive.mp4',
              bytes: 9999,
              videoDuration: 42,
            })}\n`,
          ),
        );
        // Intentionally never close — mirrors HTTP/1.1 keep-alive hang.
      },
    });
    const res = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    });

    const result = await Promise.race([
      consumeProcessStream(res, () => undefined),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('hung_waiting_for_eof')), 500);
      }),
    ]);

    expect(result.mode).toBe('r2');
    expect(result.r2Key).toBe('clips/abc/keep-alive.mp4');
    expect(result.videoDuration).toBe(42);
  });

  it('rejette mode done inconnu immédiatement (pas de hang keep-alive)', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: 'done', mode: 'weird', r2Key: 'x', bytes: 10 })}\n`,
          ),
        );
        // never close
      },
    });
    const res = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    });

    await expect(
      Promise.race([
        consumeProcessStream(res, () => undefined),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('hung_waiting_for_eof')), 500);
        }),
      ]),
    ).rejects.toThrow(/container_unknown_done_mode/);
  });

  it('rejette event type inconnu', async () => {
    const res = ndjsonResponse([JSON.stringify({ type: 'pong', hello: true })]);
    await expect(consumeProcessStream(res, () => undefined)).rejects.toThrow(
      /container_unknown_event_type/,
    );
  });

  it('rejette bytes done invalides', async () => {
    const res = ndjsonResponse([
      JSON.stringify({ type: 'done', mode: 'r2', r2Key: 'clips/a.mp4', bytes: 'nope' }),
    ]);
    await expect(consumeProcessStream(res, () => undefined)).rejects.toThrow(
      'container_invalid_done_bytes',
    );
  });

  it('exige égalité taille inline vs bytes', async () => {
    const mp4 = new Uint8Array(2048);
    const res = ndjsonResponse(
      [JSON.stringify({ type: 'done', mode: 'inline', bytes: 4096 })],
      mp4,
    );
    await expect(consumeProcessStream(res, () => undefined)).rejects.toThrow(/inline_size_mismatch/);
  });

  it('timeout inline si EOF never arrives et bytes incomplets', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: 'done', mode: 'inline', bytes: 4096 })}\n`,
          ),
        );
        controller.enqueue(new Uint8Array(100));
        // never close, never enough bytes
      },
    });
    const res = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    });

    await expect(
      consumeProcessStream(res, () => undefined, { inlineEofTimeoutMs: 50 }),
    ).rejects.toThrow('inline_eof_timeout');
  });

  it('respecte AbortSignal', async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start() {
        /* never enqueue */
      },
    });
    const res = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    });
    const ac = new AbortController();
    ac.abort(new Error('job_process_timeout'));
    await expect(
      consumeProcessStream(res, () => undefined, { signal: ac.signal }),
    ).rejects.toThrow('job_process_timeout');
  });

  it('retourne early inline dès que enough bytes (pas d’EOF)', async () => {
    const encoder = new TextEncoder();
    const mp4 = new Uint8Array(2048);
    mp4[0] = 0x01;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type: 'done', mode: 'inline', bytes: 2048 })}\n`),
        );
        controller.enqueue(mp4);
        // keep-alive hang
      },
    });
    const res = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/x-ndjson' },
    });

    const result = await Promise.race([
      consumeProcessStream(res, () => undefined),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('hung_waiting_for_eof')), 500);
      }),
    ]);
    expect(result.mode).toBe('inline');
    expect(result.inlineBytes?.byteLength).toBe(2048);
  });
});
