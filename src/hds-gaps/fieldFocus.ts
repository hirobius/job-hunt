// Is a typing field focused? For the action dock (#535), which hides while the keyboard is up.
// hds-gap: hirobius/hds#1432 (G1: a bottom dock that hides while a field has focus)
import { useEffect, useState } from 'react';

const FIELD = 'textarea, [contenteditable="true"], input';
const NOT_TYPED = ['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'];
/** How long focus must stay out of every field before the dock comes back: moving from one field
 *  to the next never flashes it (interaction review 2026-11-11). */
export const SHOW_AFTER_MS = 150;

/** True when `el` takes typing (so the on-screen keyboard is up on a phone). */
export function isTypingField(el: Element | null): boolean {
  if (!el || !el.matches(FIELD)) return false;
  return !(el instanceof HTMLInputElement && NOT_TYPED.includes(el.type));
}

/** True while a typing field has focus: on at once on focusin, off only once focus has been out
 *  of every field for SHOW_AFTER_MS. */
export function useFieldFocused(): boolean {
  const [on, setOn] = useState(() => isTypingField(document.activeElement));
  useEffect(() => {
    let timer = 0;
    const sync = () => {
      window.clearTimeout(timer);
      if (isTypingField(document.activeElement)) setOn(true);
      else
        timer = window.setTimeout(
          () => setOn(isTypingField(document.activeElement)),
          SHOW_AFTER_MS,
        );
    };
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', sync);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', sync);
    };
  }, []);
  return on;
}
