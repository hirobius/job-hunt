// HDS gap (sign-in, 2026-10-17; related: hds#690): HDS has no Sheet, and its Dialog centres on the layout viewport,
// so on iOS the on-screen keyboard covers its lower half. This mirrors `window.visualViewport`
// (the part of the page the keyboard leaves visible) into two CSS variables on an element:
// `--rjb-vv-top` (px from the layout viewport's top), `--rjb-vv-height` (px) and `--rjb-vv-bottom`
// (px from the layout viewport's bottom up to the visible part's end: the keyboard, read by the
// action dock, #593). CSS then keeps the content in what is visible. Ask: a top-anchored / keyboard-aware Dialog or Sheet.
// Without visualViewport (jsdom, old browsers) nothing is set and the CSS fallbacks apply.
//
// `data-keyboard="open"` (2026-11-09, Adrian's iPhone recording): iOS sends visualViewport resize
// events in bursts while the keyboard slides, so a size that tracks them live jumps. The sign-in
// brand has two states instead, keyboard closed and open (visible height < 80% of innerHeight),
// and one eased transition between them in CSS. The attribute changes only when the state
// changes, so the transition starts only then and never restarts mid-way.
// hds-gap: hirobius/hds#1432 (G1: keyboard-aware bottom dock and sheet)
import { useCallback, useEffect, useRef } from 'react';

export const KEYBOARD_OPEN_RATIO = 0.8;

export function keyboardOpen(vvHeight: number, innerHeight: number): boolean {
  return vvHeight < innerHeight * KEYBOARD_OPEN_RATIO;
}

/** How far the visible part of the page ends above the layout viewport's bottom (px, never
 *  below 0): the on-screen keyboard's height when it is up. A fixed bottom box (the action dock)
 *  sits this far up, so the keyboard never covers it (#593). */
export function visibleBottomGap(
  vv: { offsetTop: number; height: number },
  innerHeight: number,
): number {
  return Math.max(0, Math.round(innerHeight - vv.offsetTop - vv.height));
}

export function useVisualViewportVars<T extends HTMLElement>(): (el: T | null) => void {
  const elRef = useRef<T | null>(null);

  const write = useCallback(() => {
    const el = elRef.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;
    el.style.setProperty('--rjb-vv-top', `${Math.round(vv.offsetTop)}px`); // hds-allow: a measured viewport offset, not a spacing value
    el.style.setProperty('--rjb-vv-height', `${Math.round(vv.height)}px`); // hds-allow: a measured viewport height, not a spacing value
    el.style.setProperty('--rjb-vv-bottom', `${visibleBottomGap(vv, window.innerHeight)}px`); // hds-allow: a measured viewport offset, not a spacing value
    const state = keyboardOpen(vv.height, window.innerHeight) ? 'open' : 'closed';
    if (el.dataset.keyboard !== state) el.dataset.keyboard = state;
  }, []);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let frame = 0;
    const apply = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        write();
      });
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      cancelAnimationFrame(frame);
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
