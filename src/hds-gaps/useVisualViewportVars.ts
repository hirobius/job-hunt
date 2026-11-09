// HDS gap (sign-in, 2026-10-17; related: hds#690): HDS has no Sheet, and its Dialog centres on the layout viewport,
// so on iOS the on-screen keyboard covers its lower half. This mirrors `window.visualViewport`
// (the part of the page the keyboard leaves visible) into two CSS variables on an element:
// `--rjb-vv-top` (px from the layout viewport's top) and `--rjb-vv-height` (px). CSS then pins
// the panel to the top of what is visible. Ask: a top-anchored / keyboard-aware Dialog or Sheet.
// Without visualViewport (jsdom, old browsers) nothing is set and the CSS fallbacks apply.
import { useCallback, useEffect, useRef } from 'react';

// `--rjb-vv-scale` (2026-11-09 flicker fix): the sign-in brand's size as a scale, 1 on a full phone
// screen (5% of the visible height, clamped to 20–40px of a 40px logo) down to 0.5 on a short one.
// The keyboard fires a resize on every frame as it slides; the vars are written once per frame
// and the brand follows with transform: scale(), no transition, so the keyboard's own motion is
// the ease and nothing restarts mid-way. Under reduced motion or Pause (a `[data-paused]` inside)
// the scale snaps once, after the viewport has been still for SETTLE_MS.
const SETTLE_MS = 200;

export function useVisualViewportVars<T extends HTMLElement>(): (el: T | null) => void {
  const elRef = useRef<T | null>(null);

  const write = useCallback((scale = true) => {
    const el = elRef.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;
    el.style.setProperty('--rjb-vv-top', `${Math.round(vv.offsetTop)}px`);
    el.style.setProperty('--rjb-vv-height', `${Math.round(vv.height)}px`);
    if (scale)
      el.style.setProperty(
        '--rjb-vv-scale',
        `${Math.min(40, Math.max(20, vv.height * 0.05)) / 40}`,
      );
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const snap =
          matchMedia('(prefers-reduced-motion: reduce)').matches ||
          !!elRef.current?.querySelector('[data-paused]');
        write(!snap);
        clearTimeout(settle);
        if (snap) settle = setTimeout(write, SETTLE_MS);
      });
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      cancelAnimationFrame(frame);
      clearTimeout(settle);
    };
  }, [write]);

  return useCallback(
    (el: T | null) => {
      elRef.current = el;
      write();
    },
    [write],
  );
}
