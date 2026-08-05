#!/usr/bin/env node
/**
 * Bench Cloudflare job pipeline.
 * Usage:
 *   CONTAINER_SECRET=... DEVICE_TOKEN=... node scripts/bench-job.mjs
 *   node scripts/bench-job.mjs --url 'https://www.youtube.com/watch?v=jNQXAC9IVRw' --start 0 --end 8
 */

const DEFAULT_BASE = 'https://clippy.runtimelayer.workers.dev';
const DEFAULT_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

function arg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const base = (arg('--base', DEFAULT_BASE) || '').replace(/\/$/, '');
const videoUrl = arg('--url', DEFAULT_URL);
const start = Number(arg('--start', '0'));
const end = Number(arg('--end', '8'));
const deviceToken = process.env.DEVICE_TOKEN || arg('--token', null);

if (!deviceToken) {
  console.error('DEVICE_TOKEN or --token required');
  process.exit(1);
}

const videoId = new URL(videoUrl).searchParams.get('v');

async function main() {
  console.log('create job…', { videoUrl, start, end });
  const createdRes = await fetch(`${base}/api/jobs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${deviceToken}`,
    },
    body: JSON.stringify({
      videoId,
      videoTitle: 'bench',
      youtubeUrl: videoUrl,
      clipStart: start,
      clipEnd: end,
    }),
  });
  const created = await createdRes.json();
  if (!createdRes.ok || !created.ok) {
    throw new Error(`create failed: ${JSON.stringify(created)}`);
  }
  console.log('created', created);

  const jobId = created.jobId;
  const started = Date.now();
  for (;;) {
    const res = await fetch(`${base}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${deviceToken}` },
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(JSON.stringify(data));
    const job = data.job;
    console.log('status', {
      stage: job.stage,
      progress: job.progress,
      elapsed_ms: Date.now() - started,
    });
    if (job.stage === 'done') {
      console.log('done', { url: job.url, clipId: job.clipId, wall_ms: Date.now() - started });
      return;
    }
    if (job.stage === 'error') {
      throw new Error(job.error || 'job error');
    }
    await new Promise((r) => setTimeout(r, 800));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
