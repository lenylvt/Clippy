#!/usr/bin/env node
/**
 * Pack extension zip then upload to R2 as releases/clippy-extension.zip
 *
 * Usage (from repo root):
 *   node scripts/upload-extension-zip.mjs
 *
 * Requires wrangler auth. Reads version from apps/extension/manifest.json.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const zipPath = path.join(root, 'clippy-extension.zip');
const manifestPath = path.join(root, 'apps/extension/manifest.json');
const r2Key = 'releases/clippy-extension.zip';
const bucket = 'clippy-clips';

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = manifest.version;
if (!version) {
  console.error('manifest.version missing');
  process.exit(1);
}

console.log(`Packing extension v${version}…`);
execFileSync('npm', ['run', 'ext:pack'], { cwd: root, stdio: 'inherit' });

if (!existsSync(zipPath)) {
  console.error('zip missing:', zipPath);
  process.exit(1);
}

console.log(`Uploading to R2 ${bucket}/${r2Key}…`);
execFileSync(
  'npm',
  [
    '--prefix',
    'apps/worker',
    'exec',
    '--',
    'wrangler',
    'r2',
    'object',
    'put',
    `${bucket}/${r2Key}`,
    '--file',
    zipPath,
    '--content-type',
    'application/zip',
    '--config',
    'wrangler.jsonc',
    '--remote',
  ],
  { cwd: root, stdio: 'inherit' },
);

console.log(`OK — zip uploaded. Keep wrangler EXTENSION_VERSION="${version}" in sync.`);
console.log(`Install page: https://clippy.runtimelayer.workers.dev/install`);
