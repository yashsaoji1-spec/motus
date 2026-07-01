import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  root: 'code',
  envDir: '..',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // Keep lazy Firebase submodules in their own dynamic chunks — never group.
          if (/firebase\/compat\/(storage|functions|analytics)/.test(id)) return;
          if (/@firebase\/(storage|functions|analytics)/.test(id)) return;
          if (id.includes('firebase') || id.includes('@firebase') ||
              id.includes('@grpc') || id.includes('protobufjs')) return 'firebase-core';
        },
      },
    },
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
  },
  server: {
    host: 'localhost',
    hmr: { overlay: false },
  },
});
