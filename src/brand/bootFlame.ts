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

runBootFlame();
