// HDS gap (sign-in, 2026-10-17; related: hds#690): HDS has no Sheet, and its Dialog centres on the layout viewport,
// so on iOS the on-screen keyboard covers its lower half. This mirrors `window.visualViewport`
// (the part of the page the keyboard leaves visible) into two CSS variables on an element:
// `--rjb-vv-top` (px from the layout viewport's top) and `--rjb-vv-height` (px). CSS then pins
// the panel to the top of what is visible. Ask: a top-anchored / keyboard-aware Dialog or Sheet.
// Without visualViewport (jsdom, old browsers) nothing is set and the CSS fallbacks apply.
import { useCallback, useEffect, useRef } from 'react';

const SETTLE_MS = 200;

// `--rjb-vv-sized-height` sizes the brand and the column's top space (2026-11-09 flicker fix).
// The keyboard fires a resize on every frame as it slides; each one restarted the brand's size
// transition, so the top of the screen flickered. It now changes only once the viewport has been
// still for SETTLE_MS: one smooth ease once the keyboard is up, not one per frame.
export function useVisualViewportVars<T extends HTMLElement>(): (el: T | null) => void {
  const elRef = useRef<T | null>(null);

  const write = useCallback((sized?: boolean) => {
    const el = elRef.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;
    const h = `${Math.round(vv.height)}px`;
    el.style.setProperty('--rjb-vv-top', `${Math.round(vv.offsetTop)}px`);
    el.style.setProperty('--rjb-vv-height', h);
    if (sized) el.style.setProperty('--rjb-vv-sized-height', h);
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      write();
      clearTimeout(settle);
      settle = setTimeout(write, SETTLE_MS, true);
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      clearTimeout(settle);
    };
  }, [write]);

  return useCallback(
    (el: T | null) => {
      elRef.current = el;
      write(true);
    },
    [write],
  );
}
