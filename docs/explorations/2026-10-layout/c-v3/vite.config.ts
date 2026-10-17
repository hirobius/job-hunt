// C v3 exploration (2026-10-17): a static gallery built with the real HDS package the app uses.
// Run from the repo root: `npx vite --config docs/explorations/2026-10-layout/c-v3/vite.config.ts`.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: here,
  base: './',
  plugins: [react()],
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input: { index: resolve(here, 'index.html'), screen: resolve(here, 'screen.html') } },
  },
});
