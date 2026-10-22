import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { applyBrand } from './src/brandHtml.ts';
import { fontPreloadTag } from './src/fontPreload.ts';

export default defineConfig({
  // brand-html: index.html's %BRAND_*% placeholders come from src/brand.ts (#55).
  plugins: [
    react(),
    { name: 'brand-html', transformIndexHtml: (html: string) => applyBrand(html) },
    // preload-font: the body font is fetched with the HTML, not after the CSS is parsed.
    {
      name: 'preload-font',
      apply: 'build',
      transformIndexHtml: {
        order: 'post',
        handler: (html, ctx) => {
          const tag = fontPreloadTag(Object.keys(ctx.bundle ?? {}));
          return tag ? html.replace('</title>', `</title>\n    ${tag}`) : html;
        },
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        // The lazy supabase-js chunk keeps a readable name (it would be "dist-<hash>").
        chunkFileNames: (c) =>
          c.moduleIds.some((m) => m.includes('@supabase/supabase-js'))
            ? 'assets/supabase-[hash].js'
            : 'assets/[name]-[hash].js',
        // Split heavy vendors out of the app chunk so the initial payload is
        // cacheable and smaller (the app was shipping as one ~657 kB bundle).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // supabase-js is a dynamic import (src/supabase.ts): leave it out of every group so it
          // gets its own lazy chunk. A named group would also pull in its shared deps (tslib, used
          // by HDS's radix deps), and vendor would then import the whole chunk at startup.
          if (/[\\/]node_modules[\\/](@supabase|iceberg-js)[\\/]/.test(id)) return undefined;
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
    // Room for findBy's 5 s (src/test/setup.ts) on a busy builder.
    testTimeout: 20_000,
  },
});
