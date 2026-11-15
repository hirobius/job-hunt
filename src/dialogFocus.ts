// Where focus goes when a route dialog (Documents, Privacy and terms; #471 slice 4) closes. These
// dialogs have no trigger of their own (a menu item, a link or the URL opens them), so Radix would
// drop focus on <body>. The control that opened one gets it back (a menu item's menu's trigger, the
// Account button); when there is none, or it is gone, the page's heading takes it (focusRescue).
import { useLayoutEffect, useRef } from 'react';
import { focusAsHeading, pageHeadingNow } from './focusRescue';

/** The control to hand focus back to: a menu item stands for its menu's trigger. */
export function openerOf(el: Element | null): HTMLElement | null {
  if (!el || el === document.body || !(el instanceof HTMLElement)) return null;
  const menu = el.closest('[role="menu"]');
  if (!menu) return el;
  const id = menu.getAttribute('aria-labelledby');
  return id ? document.getElementById(id) : null;
}

/** Remember the opener as the dialog opens; the returned handler is its `onCloseAutoFocus`. */
export function useDialogFocus(open: boolean): (e: Event) => void {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    // Before Radix moves focus into the dialog (its focus scope runs in a later effect).
    if (open) opener.current = openerOf(document.activeElement);
  }, [open]);
  return (e: Event) => {
    e.preventDefault();
    const el = opener.current;
    opener.current = null;
    if (el?.isConnected) {
      el.focus();
      return;
    }
    const h = pageHeadingNow();
    if (h) focusAsHeading(h);
  };
}

/** For `Dialog.Content`'s `onOpenAutoFocus`: start on the dialog's Close key, not its first
 *  control. For a dialog whose first control sits mid-text (Privacy and terms) or removes
 *  something (the Search profile's first title): a screen reader starts at the top, a phone shows
 *  no stray ring mid-dialog, and Enter or Space right after it opens changes nothing. */
export function focusClose(e: Event) {
  // HDS's close button is named by its sr-only text ("Close"), not an aria-label.
  const close = [...((e.target as HTMLElement | null)?.querySelectorAll('button') ?? [])].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === 'Close',
  );
  if (!close) return;
  e.preventDefault();
  close.focus({ preventScroll: true });
}
