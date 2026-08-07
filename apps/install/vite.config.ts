import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/install/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../worker/public/install'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'https://clippy.runtimelayer.workers.dev',
      '/extension.zip': 'https://clippy.runtimelayer.workers.dev',
    },
  },
});
