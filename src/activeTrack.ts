// The track picked last in Companies (DiscoverView's switcher), kept per browser. Read by the Find
// box (#384) and the auto-scan (feed/useAutoScan.ts) too, so both act on that track.
import { useMemo } from 'react';
import { useCategories } from './curation/curationStore';
import type { Category } from './curation/types';

export const ACTIVE_CATEGORY_KEY = 'rjb_active_category';

/** The stored track when it still exists, else the first one. Needs at least one track. */
export function loadActiveCategory(categories: Pick<Category, 'id'>[]): string {
  try {
    const stored = localStorage.getItem(ACTIVE_CATEGORY_KEY);
    if (stored && categories.some((c) => c.id === stored)) return stored;
  } catch {
    /* ignore */
  }
  return categories[0].id;
}

/** The active track, or undefined when there are none. */
export function useActiveTrack(): Category | undefined {
  const categories = useCategories();
  return useMemo(() => {
    if (!categories.length) return undefined;
    const id = loadActiveCategory(categories);
    return categories.find((c) => c.id === id);
  }, [categories]);
}
