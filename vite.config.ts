import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));
const sharedSrc = path.join(root, 'packages/shared/src');

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@clippy\/shared\/(.*)$/,
        replacement: `${sharedSrc}/$1`,
      },
    ],
  },
  test: {
    include: [
      'apps/extension/tests/**/*.test.{js,ts}',
      'apps/worker/tests/**/*.test.ts',
      'packages/shared/tests/**/*.test.ts',
      'apps/mobile/tests/**/*.test.ts',
      'apps/install/tests/**/*.test.ts',
    ],
  },
});
