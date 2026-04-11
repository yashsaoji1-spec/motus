import { defineConfig } from 'vite';

export default defineConfig({
  root: 'code',
  envDir: '..',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    host: 'localhost',
    hmr: { overlay: false },
  },
});
