// HDS gap (sign-in, 2026-10-17; related: hds#690): HDS has no Sheet, and its Dialog centres on the layout viewport,
// so on iOS the on-screen keyboard covers its lower half. This mirrors `window.visualViewport`
// (the part of the page the keyboard leaves visible) into two CSS variables on an element:
// `--rjb-vv-top` (px from the layout viewport's top) and `--rjb-vv-height` (px). CSS then pins
// the panel to the top of what is visible. Ask: a top-anchored / keyboard-aware Dialog or Sheet.
// Without visualViewport (jsdom, old browsers) nothing is set and the CSS fallbacks apply.
import { useCallback, useEffect, useRef } from 'react';

export function useVisualViewportVars<T extends HTMLElement>(): (el: T | null) => void {
  const elRef = useRef<T | null>(null);

  const apply = useCallback(() => {
    const el = elRef.current;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!el || !vv) return;
    el.style.setProperty('--rjb-vv-top', `${Math.round(vv.offsetTop)}px`);
    el.style.setProperty('--rjb-vv-height', `${Math.round(vv.height)}px`);
  }, []);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, [apply]);

  return useCallback(
    (el: T | null) => {
      elRef.current = el;
      apply();
    },
    [apply],
  );
}
