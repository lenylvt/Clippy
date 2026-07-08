import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'extension/lib/**/*.test.js',
      'worker/src/**/*.test.ts',
      'shared/**/*.test.js',
    ],
  },
});
