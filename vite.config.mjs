import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  root: 'code',
  envDir: '..',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
  },
  server: {
    host: 'localhost',
    hmr: { overlay: false },
  },
});
