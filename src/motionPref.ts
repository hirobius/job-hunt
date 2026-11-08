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

export function setMotionPaused(paused: boolean): void {
  stored(paused ? '1' : '0');
  dispatchEvent(new Event(MOTION_EVENT));
}
