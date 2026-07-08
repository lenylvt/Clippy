import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'extension/vendor/ffmpeg');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

const ffmpegPkg = join(root, 'node_modules/@ffmpeg/ffmpeg/dist/esm');
const utilPkg = join(root, 'node_modules/@ffmpeg/util/dist/esm');
const corePkg = join(root, 'node_modules/@ffmpeg/core/dist/esm');

/** Copy only runtime .js / .mjs files from a package dir. */
function copyRuntimeJs(fromDir, toDir) {
  mkdirSync(toDir, { recursive: true });
  for (const name of readdirSync(fromDir)) {
    if (!name.endsWith('.js') && !name.endsWith('.mjs')) continue;
    cpSync(join(fromDir, name), join(toDir, name));
  }
}

// Full ESM trees — ffmpeg.js re-exports ./classes.js, worker, etc.
copyRuntimeJs(ffmpegPkg, join(target, 'ffmpeg'));
copyRuntimeJs(utilPkg, join(target, 'util'));
cpSync(join(corePkg, 'ffmpeg-core.js'), join(target, 'ffmpeg-core.js'));
cpSync(join(corePkg, 'ffmpeg-core.wasm'), join(target, 'ffmpeg-core.wasm'));

console.log('FFmpeg vendored into extension/vendor/ffmpeg');
console.log(
  '  ffmpeg:',
  readdirSync(join(target, 'ffmpeg')).join(', '),
  '\n  util:',
  readdirSync(join(target, 'util')).join(', '),
);
