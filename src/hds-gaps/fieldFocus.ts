// Is a typing field focused? For the action dock (#535), which hides while the keyboard is up.
// hds-gap: hirobius/hds#1432 (G1: a bottom dock that hides while a field has focus)
import { useEffect, useState } from 'react';

const FIELD = 'textarea, select, [contenteditable="true"], input';
const NOT_TYPED = ['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file'];

/** True when `el` takes typing (so the on-screen keyboard is up on a phone). */
export function isTypingField(el: Element | null): boolean {
  if (!el || !el.matches(FIELD)) return false;
  return !(el instanceof HTMLInputElement && NOT_TYPED.includes(el.type));
}

/** True while a typing field anywhere on the page has focus. */
export function useFieldFocused(): boolean {
  const [on, setOn] = useState(() => isTypingField(document.activeElement));
  useEffect(() => {
    const sync = () => setOn(isTypingField(document.activeElement));
    const out = () => queueMicrotask(sync);
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', out);
    return () => {
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', out);
    };
  }, []);
  return on;
}

