// Build side of landingPreload.ts (the `landing-preload` plugin in vite.config.ts): for each landing
// view, the chunks and CSS its import pulls in that the entry does not already load. Pure over the
// bundle's chunk list, so the test can check it without a build.
import type { LandingView } from './landingPreload';

/** The meta the plugin writes and landingPreload.ts reads. */
export const LANDING_META = 'rjb-landing-chunks';

export interface BundleChunk {
  type: 'chunk' | 'asset';
  fileName: string;
  isEntry?: boolean;
  facadeModuleId?: string | null;
  /** Every module in the chunk (a view can share a chunk with another one). */
  moduleIds?: string[];
  imports?: string[];
  viteMetadata?: { importedCss?: Set<string> };
}

/** The source file each landing view is (routeViews.ts). */
export const LANDING_SOURCES: Record<LandingView, string> = {
  review: '/src/Today.tsx',
  apply: '/src/TrackerView.tsx',
  job: '/src/JobPage.tsx',
};

/** Each view's extra files as site paths ("/assets/…"), entry's own static closure left out. */
export function landingChunks(chunks: BundleChunk[]): Partial<Record<LandingView, string[]>> {
  const byName = new Map(chunks.filter((c) => c.type === 'chunk').map((c) => [c.fileName, c]));
  const closure = (start: string[]) => {
    const seen = new Set<string>();
    const visit = (n: string) => {
      if (seen.has(n) || !byName.has(n)) return;
      seen.add(n);
      for (const i of byName.get(n)?.imports ?? []) visit(i);
    };
    start.forEach(visit);
    return seen;
  };
  const initial = closure([...byName.values()].filter((c) => c.isEntry).map((c) => c.fileName));
  const out: Partial<Record<LandingView, string[]>> = {};
  for (const [view, src] of Object.entries(LANDING_SOURCES) as [LandingView, string][]) {
    const has = (id: string | null | undefined) => !!id && id.replace(/\\/g, '/').endsWith(src);
    const all = [...byName.values()];
    const root = all.find((c) => has(c.facadeModuleId)) ?? all.find((c) => c.moduleIds?.some(has));
    if (!root) continue;
    const files: string[] = [];
    for (const n of closure([root.fileName])) {
      if (initial.has(n)) continue;
      files.push(`/${n}`);
      for (const css of byName.get(n)?.viteMetadata?.importedCss ?? []) files.push(`/${css}`);
    }
    out[view] = [...new Set(files)];
  }
  return out;
}
