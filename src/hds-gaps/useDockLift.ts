// The action dock's keyboard lift (`--rjb-dock-lift`). The dock is `position: fixed; bottom: 0`
// on body and never moves on scroll: the variable is written on visualViewport resize and on a
// change of field focus only, and is non-zero only while a keyboard is open and a field has focus
// (`dockLift`). It used to follow `--rjb-vv-bottom` on every visualViewport scroll, which on iOS
// (overscroll bounce, standalone web app) raised the dock half-way up the content.
// hds-gap: hirobius/hds#1432 (G1: keyboard-aware bottom dock)
import { useCallback, useEffect, useRef } from 'react';
import { dockLift } from './useVisualViewportVars';

export function useDockLift<T extends HTMLElement>(typing: boolean): (el: T | null) => void {
  const elRef = useRef<T | null>(null);
  const typingRef = useRef(typing);
  const write = useCallback(() => {
    const el = elRef.current;
    const vv = window.visualViewport;
    if (!el) return;
    const lift = vv ? dockLift(vv, window.innerHeight, typingRef.current) : 0;
    el.style.setProperty('--rjb-dock-lift', `${lift}px`); // hds-allow: a measured keyboard height, not a spacing value
  }, []);
  useEffect(() => {
    typingRef.current = typing;
    write();
  }, [typing, write]);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    vv.addEventListener('resize', write);
    return () => vv.removeEventListener('resize', write);
  }, [write]);
  return useCallback(
    (el: T | null) => {
      elRef.current = el;
      write();
    },
    [write],
  );
}
