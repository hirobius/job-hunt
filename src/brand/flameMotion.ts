// Plays the flame engine (Version E, endless) on a rendered flame.svg: every 1/fps it rewrites the
// three layers' `d` (the outer's clip follows through its <use>), so the svg's box never changes.
// The wordmark's letters flicker with it, per letter (a slight lean and fade: transform and
// opacity only, never layout). Still under prefers-reduced-motion (and when it is turned on
// mid-run), paused while the tab is hidden, and nothing at all where matchMedia is missing.
import { FLAME_E, endlessFrames, rng } from './flameEngine';

const REDUCE = '(prefers-reduced-motion: reduce)';
const LAYERS = ['.flame-1', '.flame-2', '.flame-3'];

/** Start the flame in `svg` (and the letters' flicker). Returns the stop, which puts flame.svg's
 *  still frame and the letters back. */
export function animateFlame(svg: Element, letters: HTMLElement[] = []): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const S = FLAME_E;
  const paths = LAYERS.map((sel) => svg.querySelector(sel));
  const still = paths.map((p) => p?.getAttribute('d') ?? '');
  const mq = window.matchMedia(REDUCE);
  let timer: ReturnType<typeof setInterval> | undefined;
  let next = endlessFrames(S, (Math.random() * 1e9) | 0);
  const jiggle = rng(99);
  let n = 0;

  const tick = () => {
    if (document.hidden) return;
    next().forEach((d, i) => paths[i]?.setAttribute('d', d));
    n++;
    if (S.tOn !== 'letters' || n % S.tEvery) return;
    for (const l of letters) {
      const dx = ((jiggle() * 2 - 1) * S.tShake) / 100;
      const skew = ((jiggle() * 2 - 1) * S.tSkew).toFixed(1);
      l.style.transform = (dx ? `translateX(${dx.toFixed(3)}em) ` : '') + `skewX(${skew}deg)`;
      l.style.opacity = (1 - jiggle() * S.tFade).toFixed(2);
    }
  };
  const halt = () => {
    clearInterval(timer);
    timer = undefined;
    still.forEach((d, i) => paths[i]?.setAttribute('d', d));
    for (const l of letters) {
      l.style.transform = '';
      l.style.opacity = '';
    }
  };
  const sync = () => {
    if (mq.matches) halt();
    else if (!timer) {
      next = endlessFrames(S, (Math.random() * 1e9) | 0);
      timer = setInterval(tick, 1000 / S.fps);
    }
  };
  sync();
  mq.addEventListener?.('change', sync);
  return () => {
    mq.removeEventListener?.('change', sync);
    halt();
  };
}
