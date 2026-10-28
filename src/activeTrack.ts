// The track Discover has open, kept per browser so it reopens there (DiscoverView) and so the
// auto-scan (feed/useAutoScan.ts) scans for the same track. One module, so both read it the same way.
import type { Category } from './curation/types';

export const ACTIVE_CATEGORY_KEY = 'rjb_active_category';

/** The stored track when it still exists, else the first one. Needs at least one track. */
export function loadActiveCategory(categories: Pick<Category, 'id'>[]): string {
  try {
    const stored = localStorage.getItem(ACTIVE_CATEGORY_KEY);
    if (stored && categories.some((c) => c.id === stored)) return stored;
  } catch {
    /* blocked storage: the first track */
  }
  return categories[0].id;
}
