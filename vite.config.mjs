import { defineConfig } from 'vite';

export default defineConfig({
  root: 'code',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    host: 'localhost',
    hmr: { overlay: false },
  },
});
