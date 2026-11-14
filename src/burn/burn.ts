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

/** The char band over the page, in `tone` (the old page colour), darkened. Sized in px from the
 *  same w × h as the burn field and the reveal clip, so one user unit is one CSS px of the
 *  viewport: the edge sits exactly on the hole's boundary. (It was 100vw × 100vh with a stretched
 *  viewBox; on iOS Safari 100vh is the large viewport, taller than innerHeight, so the edge drew
 *  scaled down the page, beside the hole: #695 follow-up, Adrian's iPhone recording.) */
export function overlay(w: number, h: number, tone: string) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'rjb-burn-rim');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  // The same w × h in CSS (burn.css multiplies them out), so no stylesheet rule can resize it.
  svg.style.setProperty('--rjb-burn-w', String(w));
  svg.style.setProperty('--rjb-burn-h', String(h));
  svg.style.setProperty('--rjb-burn-tone', tone);
  svg.style.setProperty('--rjb-burn-char', String(BURN.edgeOpacity));
  svg.dataset.edge = BURN.edgeColor;
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('class', 'rjb-burn-char');
  p.setAttribute('fill-rule', 'evenodd');
  svg.append(p);
  return { svg, show: (f: BurnFrame) => p.setAttribute('d', f.char ? f.char + f.hole : '') };
}

/** The app bar's logo in the old theme, live, over the real one (which is in the new theme from the
 *  first frame), clipped to what the front has not reached yet: the logo turns only where and when
 *  the front passes, and its flame keeps moving on both sides. A full-viewport box holding a copy at
 *  the logo's place, so the copy takes the page's clip in page coordinates. The copy's colours are
 *  the old theme's, read before the swap and set inline; its flame follows the real one's paths. */
function oldLogo(w: number, h: number) {
  const logo = document.querySelector<HTMLElement>('header .rjb-logo-link');
  if (!logo) return null;
  const r = logo.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'rjb-burn-logo-old';
  box.setAttribute('aria-hidden', 'true');
  box.inert = true;
  const copy = logo.cloneNode(true) as HTMLElement;
  copy.removeAttribute('href');
  copy.removeAttribute('id');
  copy.tabIndex = -1;
  copy.classList.add('rjb-burn-logo-copy');
  // The logo's box, in px (burn.css multiplies them out).
  copy.style.setProperty('--rjb-burn-x', String(r.left));
  copy.style.setProperty('--rjb-burn-y', String(r.top));
  copy.style.setProperty('--rjb-burn-w', String(r.width));
  copy.style.setProperty('--rjb-burn-h', String(r.height));
  const from = [logo, ...logo.querySelectorAll<Element>('*')];
  const to = [copy, ...copy.querySelectorAll<Element>('*')];
  from.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const t = (to[i] as HTMLElement | SVGElement | undefined)?.style;
    if (!t) return;
    t.setProperty('color', cs.color);
    t.setProperty('fill', cs.fill);
    t.setProperty('stroke', cs.stroke);
  });
  box.append(copy);
  const mo = new MutationObserver((ms) => {
    for (const m of ms) {
      const i = from.indexOf(m.target as Element);
      const el = to[i];
      if (i < 0 || !el || !m.attributeName) continue;
      const v = (m.target as Element).getAttribute(m.attributeName);
      if (m.attributeName === 'style' || m.attributeName === 'class') continue;
      if (v === null) el.removeAttribute(m.attributeName);
      else el.setAttribute(m.attributeName, v);
    }
  });
  mo.observe(logo, { attributes: true, subtree: true, attributeFilter: ['d', 'transform'] });
  return {
    box,
    clip: (hole: string) =>
      box.style.setProperty(
        'clip-path',
        `path(evenodd, 'M-40,-40H${w + 40}V${h + 40}H-40Z${hole}')`,
      ),
    remove: () => {
      mo.disconnect();
      box.remove();
    },
  };
}

/** The hole alone: the new theme shows through it. Set synchronously each step (no image mask,
 *  which decodes late and blanks a frame). */
export const holeClip = (hole: string) => (hole ? `path(evenodd, '${hole}')` : 'inset(50%)');

/** Frame times per burn, read by the perf check. */
const stats = ((globalThis as { __burnStats?: number[][] }).__burnStats ??= []);

/** Run the burn over a w×h box from `at` for `ms`: the contour steps at BURN.fps. Each step's
 *  contour is computed in its own task right after the previous step is applied, so a frame never
 *  carries both the maths and the repaint of the new clip (perf check, #688). */
function runBurn(frame: (p: number) => BurnFrame, ms: number, apply: (f: BurnFrame) => void) {
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

/** Which burn holds the no-transition class: only the latest one's end removes it, so a burn
 *  started inside an earlier one's two-frame tail keeps it (#695). */
let switching = 0;

/** Put the no-transition class on; returns this burn's generation for endSwitching. */
export function startSwitching(): number {
  document.documentElement.classList.add('rjb-theme-switching');
  return ++switching;
}

/** Drop the no-transition class `frames` animation frames from now (0: at once), unless a later
 *  burn has taken it since. */
export function endSwitching(gen: number, frames: number) {
  const root = document.documentElement;
  const done = () => {
    if (gen === switching) root.classList.remove('rjb-theme-switching');
  };
  if (!frames || typeof requestAnimationFrame !== 'function') return done();
  requestAnimationFrame(() => (frames > 1 ? requestAnimationFrame(done) : done()));
}

/** Reveal the new theme over the old from `at`; `swap` flips the theme synchronously. False (and
 *  nothing done) under Pause animations: the caller swaps at once. */
export async function burnTheme(at: Pt, swap: () => void): Promise<boolean> {
  if (motionPaused()) return false;
  const root = document.documentElement;
  const w = innerWidth,
    h = innerHeight;
  // The field is built here, on the tap, before the transition: not after `ready` (#695: ~200 ms
  // at 1440x900 there stalled the first frame).
  const frame = createBurn(BURN, w, h, at.x, at.y);
  const { svg, show } = overlay(w, h, getComputedStyle(document.body).backgroundColor);
  svg.dataset.root = '';
  const old = oldLogo(w, h);
  old?.clip('');
  root.setAttribute('data-rjb-burning', '');
  // No transitions while the theme flips (#695): colours behind the front are final at once.
  const gen = startSwitching();
  root.style.setProperty('--rjb-burn-clip', 'inset(50%)');
  let vt: ViewTransition;
  try {
    vt = document.startViewTransition(() => {
      swap();
      syncThemeColor();
      document.body.append(svg);
      if (old) document.body.append(old.box);
    });
  } catch (e) {
    endSwitching(gen, 0);
    svg.remove();
    old?.remove();
    root.removeAttribute('data-rjb-burning');
    root.style.removeProperty('--rjb-burn-clip');
    throw e;
  }
  let ok = false;
  try {
    await vt.ready;
    // Hold the transition open for the whole burn (its own animations are off, so it would end at once).
    root.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: BURN.themeMs + 50,
      pseudoElement: '::view-transition-new(root)',
    });
    await runBurn(frame, BURN.themeMs, (f) => {
      show(f);
      root.style.setProperty('--rjb-burn-clip', holeClip(f.hole));
      old?.clip(f.hole);
    });
    await vt.finished;
    ok = true;
    return true;
  } finally {
    endSwitching(gen, ok ? 2 : 0);
    svg.remove();
    old?.remove();
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
