// HDS gap (#365, docs/hds-upstream-asks-0.9.md): HDS Toast 0.32.0 gives Radix no `type`, so every
// toast is "foreground" and Radix announces it assertively, interrupting the screen reader; and
// Radix joins the title's and description's text with nothing between ("…7 daysSolutions
// Engineer"). Until HDS takes a polite type and separates the two, this silences Radix's
// announcer and says each toast itself: politely, errors (danger tone) assertively, the title and
// description as two phrases. Delete it in the HDS upgrade that ships the fix.

const HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';

let live: { polite: HTMLElement; assertive: HTMLElement } | null = null;

function region(role: 'status' | 'alert', politeness: 'polite' | 'assertive') {
  const el = document.createElement('div');
  el.setAttribute('role', role);
  el.setAttribute('aria-live', politeness);
  el.setAttribute('aria-atomic', 'true');
  el.dataset.rjbAnnouncer = '';
  el.style.cssText = HIDDEN;
  document.body.appendChild(el);
  return el;
}

/** The two live regions, made on first use: present before any toast, so a reader hears it. */
export function regions() {
  if (!live || !live.polite.isConnected)
    live = { polite: region('status', 'polite'), assertive: region('alert', 'assertive') };
  return live;
}

/** "Title. Description": a pause between them, unless the title already ends a sentence. */
export function announceText(title: string, description: string) {
  if (!description) return title;
  return /[.!?…:]$/.test(title) ? `${title} ${description}` : `${title}. ${description}`;
}

/** Radix's announcer: a status span it puts straight on <body> for a second. */
const isRadixAnnouncer = (n: Node): n is HTMLElement =>
  n instanceof HTMLElement &&
  n.parentElement === document.body &&
  n.getAttribute('role') === 'status' &&
  n.hasAttribute('aria-live') &&
  !('rjbAnnouncer' in n.dataset);

/** A toast: an item in the Notifications region's list (Radix's viewport). */
const isToast = (n: Node): n is HTMLLIElement =>
  n instanceof HTMLLIElement && !!n.parentElement?.closest('[aria-label^="Notifications"]');

function say(toast: HTMLLIElement) {
  const column = toast.querySelector('.flex-col');
  // The title and description lines; the actions row (its buttons) is not said.
  const [title = '', description = ''] = [...(column?.children ?? [])]
    .filter((c) => !c.querySelector('button'))
    .map((c) => c.textContent?.trim() ?? '');
  if (!title) return;
  const error = !!toast.querySelector('[class*="text-feedback-danger"]');
  const target = regions()[error ? 'assertive' : 'polite'];
  // Empty first, then the text a beat later, so the same notice twice is said twice; cleared
  // after a second like Radix's, so it never lingers outside a landmark.
  target.textContent = '';
  window.setTimeout(() => {
    target.textContent = announceText(title, description);
    window.setTimeout(() => {
      if (target.textContent === announceText(title, description)) target.textContent = '';
    }, 1000);
  }, 50);
}

let installed = false;

export function installToastAnnouncer() {
  if (installed || typeof MutationObserver === 'undefined') return;
  installed = true;
  regions();
  new MutationObserver((records) => {
    for (const r of records)
      r.addedNodes.forEach((n) => {
        if (isRadixAnnouncer(n)) {
          n.setAttribute('aria-live', 'off');
          n.setAttribute('aria-hidden', 'true');
        } else if (isToast(n)) say(n);
      });
  }).observe(document.body, { childList: true, subtree: true });
}
