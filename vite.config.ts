import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { applyBrand } from './src/brandHtml.ts';

export default defineConfig({
  // brand-html: index.html's %BRAND_*% placeholders come from src/brand.ts (#55).
  plugins: [
    react(),
    { name: 'brand-html', transformIndexHtml: (html: string) => applyBrand(html) },
  ],
  build: {
    rollupOptions: {
      output: {
        // Split heavy vendors out of the app chunk so the initial payload is
        // cacheable and smaller (the app was shipping as one ~657 kB bundle).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@supabase')) return 'supabase';
          // Exact react/react-dom/scheduler only. A loose includes('react') also caught
          // @radix-ui/react-* and lucide-react (HDS deps), splitting HDS across chunks
          // and creating a circular-init crash ("createContext of undefined").
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
