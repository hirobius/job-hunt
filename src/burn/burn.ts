// The theme burn and the Save flight (#688), a lazy chunk (ColorMode and saveFlight.ts load it
// through importFresh). The theme switch reveals the new theme over the old from the tap point: a
// View Transition whose new snapshot is clipped to the burn front's hole (burnField.ts), with a
// thin char band, the old page colour darkened, just ahead of the edge. Save lifts the card toward
// the Apply tab, which then pulses. No colour of its own.
import './burn.css';
import { BURN, createBurn, type BurnFrame } from './burnField';
import { syncThemeColor } from '../ColorMode';
import { motionPaused } from '../motionPref';

export type Pt = { x: number; y: number };

const NS = 'http://www.w3.org/2000/svg';

/** The char band over the page, in `tone` (the old page colour), darkened. */
function overlay(w: number, h: number, tone: string) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'rjb-burn-rim');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.setProperty('--rjb-burn-tone', tone);
  svg.style.setProperty('--rjb-burn-char', String(BURN.charStrength));
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('class', 'rjb-burn-char');
  p.setAttribute('fill-rule', 'evenodd');
  svg.append(p);
  return { svg, show: (f: BurnFrame) => p.setAttribute('d', f.char ? f.char + f.hole : '') };
}

/** The hole alone: the new theme shows through it. Set synchronously each step (no image mask,
 *  which decodes late and blanks a frame). */
export const holeClip = (hole: string) => (hole ? `path(evenodd, '${hole}')` : 'inset(50%)');

/** Frame times per burn, read by the perf check. */
const stats = ((globalThis as { __burnStats?: number[][] }).__burnStats ??= []);

/** Run the burn over a w×h box from `at` for `ms`: the contour steps at BURN.fps. Each step's
 *  contour is computed in its own task right after the previous step is applied, so a frame never
 *  carries both the maths and the repaint of the new clip (perf check, #688). */
function runBurn(w: number, h: number, at: Pt, ms: number, apply: (f: BurnFrame) => void) {
  const frame = createBurn(BURN, w, h, at.x, at.y);
  const times: number[] = [];
  stats.push(times);
  const step = 1000 / Math.min(60, Math.max(4, BURN.fps));
  const steps = Math.ceil(ms / step);
  const progress = (k: number) => Math.min(1, (k * step) / ms);
  let k = 0;
  let ready: BurnFrame = frame(0);
  const prepare = () => {
    ready = frame(progress(k + 1));
  };
  return new Promise<void>((done) => {
    const t0 = performance.now();
    const paint = (now: number) => {
      times.push(now);
      const e = now - t0;
      const want = e >= ms ? steps : Math.floor(e / step);
      if (want > k || (k === 0 && times.length === 1)) {
        // Late (a slow device): jump to the step it should be on.
        if (want > k + 1) ready = frame(progress(want));
        k = want;
        apply(ready);
        if (k < steps) setTimeout(prepare, 0);
      }
      if (k < steps) requestAnimationFrame(paint);
      else done();
    };
    requestAnimationFrame(paint);
  });
}

/** Reveal the new theme over the old from `at`; `swap` flips the theme synchronously. False (and
 *  nothing done) under Pause animations: the caller swaps at once. */
export async function burnTheme(at: Pt, swap: () => void): Promise<boolean> {
  if (motionPaused()) return false;
  const root = document.documentElement;
  const w = innerWidth,
    h = innerHeight;
  const { svg, show } = overlay(w, h, getComputedStyle(document.body).backgroundColor);
  svg.dataset.root = '';
  root.setAttribute('data-rjb-burning', '');
  root.style.setProperty('--rjb-burn-clip', 'inset(50%)');
  const vt = document.startViewTransition(() => {
    swap();
    syncThemeColor();
    document.body.append(svg);
  });
  try {
    await vt.ready;
    // Hold the transition open for the whole burn (its own animations are off, so it would end at once).
    root.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: BURN.themeMs + 50,
      pseudoElement: '::view-transition-new(root)',
    });
    await runBurn(w, h, at, BURN.themeMs, (f) => {
      show(f);
      root.style.setProperty('--rjb-burn-clip', holeClip(f.hole));
    });
    await vt.finished;
    return true;
  } finally {
    svg.remove();
    root.removeAttribute('data-rjb-burning');
    root.style.removeProperty('--rjb-burn-clip');
  }
}

const applyTab = () =>
  document.querySelector<HTMLElement>('nav[aria-label="Sections"] a[href^="#/apply"]');

/** The Apply tab's pulse: the saved card has landed there. */
export function pulseApply() {
  applyTab()?.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
    { duration: 300, easing: 'ease-out' },
  );
}

/** Save: lift the card, shrink it toward the Apply tab, then pulse the tab. */
export async function flyToApply(card: HTMLElement): Promise<void> {
  const tab = applyTab();
  const from = card.getBoundingClientRect();
  const to = tab?.getBoundingClientRect();
  const dx = to ? to.left + to.width / 2 - (from.left + from.width / 2) : 0;
  const dy = to ? to.top + to.height / 2 - (from.top + from.height / 2) : -from.top;
  const a = card.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: 'translateY(-8px) scale(1.02)', opacity: 1, offset: 0.2 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.12)`, opacity: 0 },
    ],
    { duration: BURN.cardMs, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' },
  );
  await a.finished;
  card.style.setProperty('visibility', 'hidden');
  pulseApply();
}
