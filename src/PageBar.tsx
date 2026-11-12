// The page bar (a phone recording, 2026-11-12): the first row of `main` on Find and Apply holds
// the Find / Apply nav at top left, where a page's title used to be; each page keeps its h1 for screen
// readers and focus (`.sr-only`, focusRescue still focuses it). A page can put its own tools at the
// right of that row (Find: "Scanned 2 h ago", the Deck's place and its More menu) through the slot
// below; with no bar (a unit test of one page) they render where the page puts them.
import { useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PageBarSlot } from './pageBarSlot';

/** Render `children` in the page bar's slot when there is one, else in place. */
export function InPageBar({ children }: { children: ReactNode }) {
  const slot = useContext(PageBarSlot);
  return slot ? createPortal(children, slot) : <>{children}</>;
}
