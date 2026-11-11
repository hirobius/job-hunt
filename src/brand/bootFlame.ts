// The boot splash's flame is alive too: this small script (its own chunk, loaded before the app's
// entry by the `boot-flame` plugin in vite.config.ts) runs the fire simulation on the splash that
// index.html already shows, so it burns, never repeating, while the app's code loads. The splash
// in the HTML is the still mark; under reduced motion, or if this never loads, it stays that.
import { animateFlame } from './flameMotion';

/** Start the splash's flame. It stops by itself once React has replaced the splash. */
export function runBootFlame(doc: Document = document): () => void {
  const svg = doc.querySelector('.rjb-boot .rjb-flame svg');
  if (!svg) return () => {};
  const halt = animateFlame(svg);
  const watch = setInterval(() => {
    if (!svg.isConnected) stop();
  }, 250);
  function stop() {
    clearInterval(watch);
    halt();
  }
  return stop;
}

// The script is async and in the head, so it can run before the body is parsed: wait for the
// splash (a few frames at most), and give up if React has already replaced it. With no document
// (a test environment torn down while a retry was queued) it gives up too.
let retry: ReturnType<typeof setTimeout> | undefined;
let running: (() => void) | undefined;
function whenSplash(tries = 120) {
  retry = undefined;
  if (typeof document === 'undefined') return;
  if (document.querySelector('.rjb-boot .rjb-flame svg')) running = runBootFlame();
  else if (tries > 0 && !document.querySelector('#root > :not(.rjb-boot)'))
    retry = setTimeout(() => whenSplash(tries - 1), 16);
}

/** Cancel the start-up wait (and stop a splash flame it started). For tests that import this
 *  module: the wait would otherwise outlive the test's document. */
export function cancelBootFlame(): void {
  if (retry !== undefined) clearTimeout(retry);
  retry = undefined;
  running?.();
  running = undefined;
}
whenSplash();
