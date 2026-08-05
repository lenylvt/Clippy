import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/extension/tests/**/*.test.js', 'apps/worker/tests/**/*.test.ts'],
  },
});
