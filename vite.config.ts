import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { applyBrand } from './src/brandHtml.ts';
import { fontPreloadTag } from './src/fontPreload.ts';
import { checkBudget } from './src/sizeBudget.ts';

const emptyBoards = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  if (!req.url?.startsWith('/api/boards')) return next();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ postings: [] }));
};

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
    // local-api-boards: /api/boards is a Vercel edge function (api/boards.ts), which nothing
    // serves under `vite dev` / `vite preview`. Answer it with no postings there, so dev, the E2E
    // specs and the gallery/screenshots show an empty designsystems.jobs row, not a failing one.
    // A spec that needs board postings can still page.route('**/api/boards*') over this.
    {
      name: 'local-api-boards',
      configureServer: (server) => void server.middlewares.use(emptyBoards),
      configurePreviewServer: (server) => void server.middlewares.use(emptyBoards),
    },
    // size-budget: the build fails when the first-paint JS/CSS or a lazy chunk outgrows
    // src/sizeBudget.ts. Locally only (`npm run verify`, the gate before a push): on Vercel it
    // warns, so a budget miss never blocks a production deploy (like `npm run audit`).
    {
      name: 'size-budget',
      apply: 'build',
      generateBundle(_options, bundle) {
        const files = Object.values(bundle).map((f) =>
          f.type === 'chunk'
            ? { fileName: f.fileName, code: f.code, isEntry: f.isEntry, imports: f.imports }
            : { fileName: f.fileName, code: f.source },
        );
        const { initialJs, initialCss, over } = checkBudget(files);
        if (over.length) {
          const msg = `Size budget (src/sizeBudget.ts): ${over.join('; ')}`;
          if (process.env.VERCEL) return this.warn(msg);
          this.error(msg);
        }
        this.info(
          `size budget ok: initial JS ${(initialJs / 1000).toFixed(1)} kB gzip, CSS ${(initialCss / 1000).toFixed(1)} kB gzip`,
        );
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
          // A lucide icon only a lazy screen uses rides that screen's chunk, not the first load's
          // vendor (the sign-in screen's Pause / Play, #519 review). Its createLucideIcon stays in
          // vendor; nothing at startup imports these files.
          if (/[\\/]lucide-react[\\/]dist[\\/]esm[\\/]icons[\\/](pause|play)\.js$/.test(id))
            return undefined;
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
