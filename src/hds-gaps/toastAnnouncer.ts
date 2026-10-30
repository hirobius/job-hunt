// HDS gap (#365, docs/hds-upstream-asks-0.9.md): HDS Toast 0.32.0 gives Radix no `type`, so every
// toast is "foreground" and Radix announces it assertively, interrupting the screen reader; and
// Radix joins the title's and description's text with nothing between ("…7 daysSolutions
// Engineer"). Until HDS takes a polite type and separates the two, this silences Radix's
// announcer and says each toast itself: politely, errors (danger tone) assertively, the title and
// description as two phrases. Delete it in the HDS upgrade that ships the fix.

const HIDDEN =
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';

/** The live regions saying a toast right now (each is on the page for about a second). */
export function announcing(politeness: 'polite' | 'assertive') {
  return [...document.querySelectorAll<HTMLElement>(`[data-rjb-announcer="${politeness}"]`)];
}

// A fresh region per toast, put on <body> as it is said (Radix's own pattern): a modal Dialog
// aria-hides <body>'s other children when it opens, so a region made earlier would be hidden while
// a dialog is up, and one region shared by two quick toasts would drop the first.
function announce(text: string, politeness: 'polite' | 'assertive') {
  const el = document.createElement('div');
  el.setAttribute('role', politeness === 'polite' ? 'status' : 'alert');
  el.setAttribute('aria-live', politeness);
  el.setAttribute('aria-atomic', 'true');
  el.dataset.rjbAnnouncer = politeness;
  el.style.cssText = HIDDEN;
  document.body.appendChild(el);
  // The text a beat after the region, so a reader hears it; gone after a second like Radix's,
  // so it never lingers outside a landmark.
  window.setTimeout(() => {
    el.textContent = text;
    window.setTimeout(() => el.remove(), 1000);
  }, 50);
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
  announce(announceText(title, description), error ? 'assertive' : 'polite');
}

let installed = false;

export function installToastAnnouncer() {
  if (installed || typeof MutationObserver === 'undefined') return;
  installed = true;
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
