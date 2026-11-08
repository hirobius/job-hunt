// The double-tap guard on a job's answers (#471): Mark applied and Not a fit open the next job at
// once, so its buttons render under the finger.
/** How long after Mark applied or Not a fit another answer is ignored: the next job's buttons
 *  render under the finger, so a double tap's second tap would answer that job too. Module-wide:
 *  the header is keyed by job, so a ref would start afresh on the next job. */
const DOUBLE_TAP_MS = 700;
let lastAnswer = 0;
/** Forget the last answer (tests start fresh, and step past the guard between deliberate taps). */
export function resetAnswerGuard(): void {
  lastAnswer = 0;
}
/** True when an answer came less than DOUBLE_TAP_MS ago (the second tap of a double tap). */
export function tooSoon(): boolean {
  const now = Date.now();
  if (now - lastAnswer < DOUBLE_TAP_MS) return true;
  lastAnswer = now;
  return false;
}

/** The second tap of a double tap can also land on another control the next job (or posting) put
 *  under the finger: its menu, a disclosure, a link. For the same window, presses inside the page
 *  (`main`) are swallowed before any control sees them (capture phase); the Account menu, tabs and
 *  notices outside `main` are left alone. */
function swallow(e: Event) {
  if (!lastAnswer || Date.now() - lastAnswer >= DOUBLE_TAP_MS) return;
  const t = e.target as Element | null;
  if (!t?.closest?.('main')) return;
  e.preventDefault();
  e.stopPropagation();
}
if (typeof document !== 'undefined')
  for (const type of ['pointerdown', 'mousedown', 'click'])
    document.addEventListener(type, swallow, true);
