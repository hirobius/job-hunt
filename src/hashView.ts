// A page's inner view kept in the URL hash as `?view=<name>`, next to the route (#/discover/live
// ?view=companies). The route store (route.ts) ignores it and drops it on any tab or sub-tab
// change, so a view never outlives the page it belongs to; refresh and back/forward restore it.
import { useCallback, useSyncExternalStore } from 'react';

export function readView(hash: string): string | null {
  const q = hash.split('?')[1];
  return (q && new URLSearchParams(q).get('view')) || null;
}

/** `hash` with its view set to `view` (null removes it). */
export function withView(hash: string, view: string | null): string {
  const [path, q = ''] = hash.split('?');
  const params = new URLSearchParams(q);
  if (view) params.set('view', view);
  else params.delete('view');
  const rest = params.toString();
  return (path || '#/') + (rest ? `?${rest}` : '');
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useHashView(): [string | null, (v: string | null) => void] {
  const view = useSyncExternalStore(
    subscribe,
    () => readView(window.location.hash),
    () => null,
  );
  const set = useCallback((v: string | null) => {
    window.location.hash = withView(window.location.hash, v);
  }, []);
  return [view, set];
}
