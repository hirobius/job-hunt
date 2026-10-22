// The document title per route: "<page> · <brand>" (tab, history, bookmarks). The shell names
// the section pages; a job, Apply mode, a Company and the legal pages name themselves (a child's
// effect runs before the shell's, so the shell leaves those routes alone).
import { useEffect } from 'react';
import { BRAND } from './brand';

export const pageTitle = (page?: string): string => (page ? `${page} · ${BRAND.name}` : BRAND.name);

/** Set the document title while mounted; `null` leaves it to another component. */
export function usePageTitle(page: string | null): void {
  useEffect(() => {
    if (page !== null) document.title = pageTitle(page);
  }, [page]);
}
