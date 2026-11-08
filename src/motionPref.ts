// Pause animations (WCAG 2.2.2, #516 review): an Account menu item that stops the app bar's
// looping flame and its embers. Per device (`rjb_ui_pause_motion`, never synced); with no choice
// made it follows the system's reduced-motion setting. The flame listens for MOTION_EVENT
// (brand/RoleFlame.tsx); this module stays tiny, it is on the first load.
const KEY = 'rjb_ui_pause_motion';
export const MOTION_EVENT = 'rjb-pause-motion';

/** True when animations are paused: the person's choice, else reduced motion. */
export function motionPaused(): boolean {
  let v: string | null = null;
  try {
    v = localStorage.getItem(KEY);
  } catch {
    /* storage blocked: follow the system */
  }
  return v ? v === '1' : !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function setMotionPaused(paused: boolean): void {
  try {
    localStorage.setItem(KEY, paused ? '1' : '0');
  } catch {
    /* storage blocked: the choice lasts this page load only */
  }
  window.dispatchEvent(new Event(MOTION_EVENT));
}
