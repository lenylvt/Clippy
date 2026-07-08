const CLIPPY_CONTENT_SCRIPTS = [
  'lib/log.js',
  'lib/time.js',
  'lib/filename.js',
  'lib/youtube.js',
  'lib/upload.js',
  'lib/recorder-mime.js',
  'lib/video-frame.js',
  'lib/shortcut.js',
  'content/clip-editor.js',
  'content/player-button.js',
  'content/record.js',
  'content/content.js',
];

const CLIPPY_CONTENT_CSS = ['content/content.css'];

globalThis.CLIPPY_CONTENT_SCRIPTS = CLIPPY_CONTENT_SCRIPTS;
globalThis.CLIPPY_CONTENT_CSS = CLIPPY_CONTENT_CSS;
