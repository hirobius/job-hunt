// Pause animations (WCAG 2.2.2, #516 review): an Account menu item that stops the app bar's
// looping flame and its embers. Per device (`rjb_ui_pause_motion`, never synced); with no choice
// made it follows the system's reduced-motion setting; an explicit Play overrides that setting
// (#516 review). The menu item reads it each time the menu opens; the flame subscribes
// (brand/RoleFlame.tsx `onMotionPref`). On the first load: kept small.
const KEY = 'rjb_ui_pause_motion';
export const MOTION_EVENT = 'rjb-pause-motion';
export const REDUCE = '(prefers-reduced-motion: reduce)';

/** The stored choice ('1' paused, '0' playing), or write one. Null when none, or storage is blocked
 *  (then the choice lasts this page load only). */
function stored(v?: string): string | null {
  try {
    if (v) localStorage.setItem(KEY, v);
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** True when animations are paused: the person's choice, else reduced motion. */
export const motionPaused = (): boolean =>
  (stored() ?? (window.matchMedia?.(REDUCE).matches ? '1' : '0')) === '1';

/** The attribute the app's own motion reads (base.css, ActionDock.css): set while the person has
 *  paused animations, so flash, collapse, arrive, view enter and the dock stop with the flame
 *  (motion pass 2026-11-18: only the flame, the save flight and the burn read the choice). The
 *  system's reduced-motion setting needs no attribute: the same CSS reads its media query.
 *  `public/theme-init.js` sets it before the first paint. */
export const PAUSED_ATTR = 'data-rjb-motion';
export function syncMotionAttr(): void {
  if (typeof document === 'undefined') return;
  if (stored() === '1') document.documentElement.setAttribute(PAUSED_ATTR, 'paused');
  else document.documentElement.removeAttribute(PAUSED_ATTR);
}

export function setMotionPaused(paused: boolean): void {
  stored(paused ? '1' : '0');
  syncMotionAttr();
  dispatchEvent(new Event(MOTION_EVENT));
}

// The choice made in another tab.
if (typeof window !== 'undefined')
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) syncMotionAttr();
  });
