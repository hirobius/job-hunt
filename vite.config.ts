import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // HDS spike: Tailwind v4 alongside MUI. The spike's CSS entry (src/hds-spike/tailwind.css)
  // imports ONLY the theme + utilities layers — NOT preflight — so Tailwind's base reset can't
  // collide with MUI/emotion (the hazard flagged in docs/adr/0001).
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors out of the app chunk so the initial payload is
        // cacheable and smaller (the app was shipping as one ~657 kB bundle).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@mui') || id.includes('@emotion')) return 'mui';
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('react') || id.includes('scheduler')) return 'react';
          return 'vendor';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'], // e2e/ is Playwright, not Vitest
    css: false,
    restoreMocks: true,
  },
});
