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
