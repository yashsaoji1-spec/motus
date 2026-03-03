import { defineConfig } from 'vite';

export default defineConfig({
  // Treat phalanX_code/ as the Vite root so index.html is found there
  root: 'phalanX_code',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    // Allow running on localhost for MediaPipe (requires secure context)
    host: 'localhost',
  },
});
