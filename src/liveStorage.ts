// One localStorage key as a live React source (#195: the feed stores each had a copy of this).
// The snapshot is the raw stored string: stable between changes, so nothing here caches state that
// a test (or another tab) could change under it. Callers parse it in a useMemo keyed on the string.
import { useSyncExternalStore } from 'react';

export function liveStorage(key: string) {
  const listeners = new Set<() => void>();
  const rawNow = () => {
    try {
      return localStorage.getItem(key) ?? '';
    } catch {
      return '';
    }
  };
  const subscribe = (l: () => void) => {
    listeners.add(l);
    window.addEventListener('storage', l);
    return () => {
      listeners.delete(l);
      window.removeEventListener('storage', l);
    };
  };
  return {
    /** Tell this tab's subscribers the key changed (call after every write). */
    notify: () => listeners.forEach((l) => l()),
    /** The raw stored string, re-rendering on a write here or in another tab. */
    useRaw: () => useSyncExternalStore(subscribe, rawNow, rawNow),
  };
}
