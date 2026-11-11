// The job page's Documents and Decks show only with a link (#540, #593 item 11), so the first one
// is added from the job's ⋯ menu: it asks the panel to open its form. The control that asked
// (the menu trigger) gets focus back when the form closes with nothing added and the panel goes.
import { createStore } from './createStore';

export type LinkField = 'docLinks' | 'decks';
const linkFormFor = createStore<{ url: string; field: LinkField } | null>(null);
let linkFormOpener: HTMLElement | null = null;
/** True from the ask until the menu closes: the menu must not take focus back from the form. */
let linkFormFocusPending = false;
export function askLinkForm(url: string, field: LinkField, opener?: HTMLElement | null) {
  linkFormOpener = opener ?? null;
  linkFormFocusPending = true;
  linkFormFor.set({ url, field });
}
/** Calls `open` when the menu asks for this job's `field` form (the panel is mounted with no
 *  link too, so it hears the ask), and takes the ask. Returns the unsubscribe. */
export function onLinkFormAsk(url: string, field: LinkField, open: () => void): () => void {
  return linkFormFor.subscribe(() => {
    const ask = linkFormFor.get();
    if (ask?.url !== url || ask.field !== field) return;
    linkFormFor.set(null);
    open();
  });
}
/** For the job menu's `onCloseAutoFocus`: keep focus in the form a menu item just opened. */
export function keepLinkFormFocus(e: Event) {
  if (!linkFormFocusPending) return;
  linkFormFocusPending = false;
  e.preventDefault();
}
/** The control that asked for the form, once, when it is still on the page. */
export function takeLinkFormOpener(): HTMLElement | null {
  const el = linkFormOpener;
  linkFormOpener = null;
  return el?.isConnected ? el : null;
}
