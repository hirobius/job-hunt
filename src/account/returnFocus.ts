// Where focus goes when a dialog opened from the Account menu closes (QA). The menu is non-modal
// and these dialogs (Reset local data, Sign in, Restore) have no trigger of their own, so Radix
// would drop focus on <body>; keyboard and screen-reader users would land at the top of the page.
// The menu names its trigger here as it opens one; the dialog hands focus back on close.
let target: HTMLElement | null = null;

/** Remember where focus returns to when the next account dialog closes. */
export function setReturnFocus(el: HTMLElement | null) {
  target = el;
}

/** For a dialog's `onCloseAutoFocus`: focus the remembered element, if it is still on the page. */
export function returnFocus(e: Event) {
  const el = target;
  target = null;
  if (!el?.isConnected) return;
  e.preventDefault();
  el.focus();
}
