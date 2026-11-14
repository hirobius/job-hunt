// The landing view's code starts downloading with the app's entry, not after it (perf pass,
// 2026-11-14). routeViews.ts loads each view (Review, the Apply list, a job) as its own chunk, and
// main.tsx asks for the landing one only once the entry has run: on a throttled phone that left
// ~1.3 s between the entry landing and the view's chunks arriving, with the page blank in between.
// This small script (its own chunk, put in the head by the `landing-preload` plugin in
// vite.config.ts, beside a meta naming each view's chunks) reads the address and adds
// <link rel="modulepreload"> for that view's chunks: fetched and parsed early, run only when
// main.tsx imports them, so nothing runs out of order (authFragment.ts still runs first).
import { LANDING_META } from './landingChunks';

/** The landing views a meta can name. */
export type LandingView = 'review' | 'apply' | 'job';

/** The view a hash opens on, as routeViews `viewFor` picks it (old slugs as `redirectOf` sends
 *  them); null for one this does not preload (a Company page, an unknown tab). */
export function landingViewOf(hash: string): LandingView | null {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const [tab = '', second = ''] = path.split('/');
  if (tab === '' || tab === 'review' || tab === 'find' || tab === 'today') return 'review';
  if (tab === 'apply' || tab === 'queue') {
    if (!second) return 'apply';
    return second === 'company' ? null : 'job';
  }
  return null;
}

/** Add the preload links for the landing view (no-op when the meta or the view is missing). */
export function preloadLanding(doc: Document = document, hash = location.hash): string[] {
  const meta = doc.querySelector<HTMLMetaElement>(`meta[name="${LANDING_META}"]`);
  const view = landingViewOf(hash);
  if (!meta || !view) return [];
  let map: Partial<Record<LandingView, string[]>>;
  try {
    map = JSON.parse(meta.content) as Partial<Record<LandingView, string[]>>;
  } catch {
    return [];
  }
  const urls = (map[view] ?? []).filter((u) => typeof u === 'string' && u.startsWith('/assets/'));
  for (const href of urls) {
    const link = doc.createElement('link');
    if (href.endsWith('.css')) {
      link.rel = 'preload';
      link.setAttribute('as', 'style');
    } else link.rel = 'modulepreload';
    link.href = href;
    doc.head.appendChild(link);
  }
  return urls;
}

preloadLanding();
