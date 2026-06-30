import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors out of the app chunk so the initial payload is
        // cacheable and smaller (the app was shipping as one ~657 kB bundle).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@mui') || id.includes('@emotion')) return 'mui';
          if (id.includes('@supabase')) return 'supabase';
          // HDS + its deps (radix, motion, lucide, router/form/zod, cva, clsx, tw-merge) get
          // their own chunk so they stay off the main path (only the lazy HDS routes load them)
          // — and so react-router doesn't fall into the react chunk (which caused a circular chunk).
          if (
            id.includes('@hirobius') ||
            id.includes('react-router') ||
            id.includes('react-hook-form') ||
            id.includes('@hookform') ||
            id.includes('lucide-react') ||
            id.includes('/motion/') ||
            id.includes('@radix-ui') ||
            id.includes('class-variance-authority') ||
            id.includes('tailwind-merge') ||
            id.includes('clsx') ||
            id.includes('zod')
          )
            return 'hds';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
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
