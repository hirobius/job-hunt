// The page under the full-screen sign-in screen stays mounted while it is open (review of #520:
// unmounting it lost unsaved drafts), but inert and hidden from assistive tech.
/** Makes the page's `main` inert and aria-hidden while `on`; the returned cleanup undoes it. */
export function holdPage(on: boolean): (() => void) | undefined {
  const m = document.querySelector('main');
  if (!m || !on) return;
  m.inert = true;
  m.setAttribute('aria-hidden', 'true');
  return () => {
    m.inert = false;
    m.removeAttribute('aria-hidden');
  };
}
