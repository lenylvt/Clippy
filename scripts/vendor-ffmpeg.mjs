import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'extension/vendor/ffmpeg');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

const ffmpegPkg = join(root, 'node_modules/@ffmpeg/ffmpeg/dist/esm');
const utilPkg = join(root, 'node_modules/@ffmpeg/util/dist/esm');
const corePkg = join(root, 'node_modules/@ffmpeg/core/dist/esm');

cpSync(join(ffmpegPkg, 'index.js'), join(target, 'ffmpeg.js'));
cpSync(join(utilPkg, 'index.js'), join(target, 'util.js'));
cpSync(join(corePkg, 'ffmpeg-core.js'), join(target, 'ffmpeg-core.js'));
cpSync(join(corePkg, 'ffmpeg-core.wasm'), join(target, 'ffmpeg-core.wasm'));

console.log('FFmpeg vendored into extension/vendor/ffmpeg');
