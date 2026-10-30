// The flame's motion loads on demand (the engine is ~3 kB gzip and the entry chunk is at its budget):
// the still frame (flame.svg) shows at once and starts moving when the chunk lands. A chunk that
// fails to load leaves it still (importFresh raises the new-version notice).
import { importFresh } from '../staleBuild';

/** The motion chunk (tests await it before they look for movement). */
export const loadMotion = importFresh(() => import('./flameMotion'));

/** animateFlame, once its chunk is in. Returns the stop; stopping before it lands starts nothing. */
export function startFlame(svg: Element, letters: HTMLElement[] = []): () => void {
  let stop: (() => void) | undefined;
  let stopped = false;
  loadMotion()
    .then(({ animateFlame }) => {
      if (!stopped) stop = animateFlame(svg, letters);
    })
    .catch(() => {});
  return () => {
    stopped = true;
    stop?.();
  };
}
