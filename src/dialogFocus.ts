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
