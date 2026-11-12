// Prototype (proto/theme-burn, for Adrian's look only): one reveal front, used two ways. The theme
// switch reveals the new theme over the old (a View Transition whose new snapshot is clipped to the
// front's hole); a card burns away the same way before collapseRow closes the gap. Save lifts the
// card toward the Apply tab instead. No colour of its own: only a thin char band ahead of the edge,
// the old surface's own colour darkened. The front is burnField.ts. A lazy chunk.
import './burn.css';
import { BURN, createBurn, type BurnFrame } from './burnField';

const CARD_MS = BURN.cardMs;
type Pt = { x: number; y: number };

const NS = 'http://www.w3.org/2000/svg';

/** The char band over the burning box, in `tone` (the old surface's colour), darkened. */
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

/** Clip paths, applied synchronously every frame (an image mask decodes late and blanks): the
 *  hole alone (the new theme over the old), or everything but the hole (a card burning away). */
const holeClip = (hole: string) => (hole ? `path(evenodd, '${hole}')` : 'inset(50%)');
const keepClip = (w: number, h: number, hole: string) => `path(evenodd, 'M-9,-9H${w + 9}V${h + 9}H-9Z${hole}')`;

/** Frame timing, read by the recording script. */
const stats = ((globalThis as { __burnStats?: number[][] }).__burnStats ??= []);

/** Run a burn over a w×h box from (x, y): every animation frame, the field's contour at time p. */
function runBurn(w: number, h: number, at: Pt, ms: number, show: (f: BurnFrame) => void, clip: (hole: string) => void) {
  const frame = createBurn(BURN, w, h, at.x, at.y);
  const times: number[] = [];
  stats.push(times);
  return new Promise<void>((done) => {
    const t0 = performance.now();
    const step = 1000 / Math.min(60, Math.max(4, BURN.fps));
    let last = -1;
    const paint = (now: number) => {
      times.push(now);
      const e = now - t0;
      // Hold each frame for 1/fps: only the front's progress steps; the field is the same seeded one.
      const p = Math.min(ms, Math.floor(e / step) * step) / ms;
      if (p !== last || e >= ms) {
        last = p;
        const f = frame(e >= ms ? 1 : p);
        show(f);
        clip(f.hole);
      }
      if (e < ms) requestAnimationFrame(paint);
      else done();
    };
    requestAnimationFrame(paint);
  });
}

function setThemeColor() {
  const bg = getComputedStyle(document.body).backgroundColor;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', bg);
}

/** Reveal the new theme over the old from `at`; `swap` flips the theme (synchronously). */
export async function burnTheme(at: Pt, swap: () => void): Promise<void> {
  const root = document.documentElement;
  const w = innerWidth,
    h = innerHeight;
  const { svg, show } = overlay(w, h, getComputedStyle(document.body).backgroundColor);
  svg.dataset.root = '';
  root.setAttribute('data-rjb-burning', '');
  root.style.setProperty('--rjb-burn-clip', 'inset(50%)');
  const vt = document.startViewTransition(() => {
    swap();
    setThemeColor();
    document.body.append(svg);
  });
  try {
    await vt.ready;
    // Hold the transition open for the whole burn (its own animations are off, so it would end at once).
    root.animate([{ opacity: 1 }, { opacity: 1 }], { duration: BURN.themeMs + 50, pseudoElement: '::view-transition-new(root)' });
    await runBurn(w, h, at, BURN.themeMs, show, (hole) => root.style.setProperty('--rjb-burn-clip', holeClip(hole)));
    await vt.finished;
  } finally {
    svg.remove();
    root.removeAttribute('data-rjb-burning');
    root.style.removeProperty('--rjb-burn-clip');
  }
}

/** Card option (runtime switch `?card=1|2|3`, default 1): 1 removals burn + Save lifts to Apply;
 *  2 Save flares up, removals smoulder grey; 3 progress only (Save and
 *  Mark applied flare, removals plain collapse). */
export const cardOption = (): 1 | 2 | 3 => {
  const n = Number(new URLSearchParams(location.search).get('card'));
  return n === 2 || n === 3 ? n : 1;
};

/** Smoulder: the card greys as the same burn takes it. */
export async function smoulder(card: HTMLElement): Promise<void> {
  card.animate([{ filter: 'none', opacity: 1 }, { filter: 'grayscale(1) brightness(.85)', opacity: 0.6 }], {
    duration: 500,
    fill: 'forwards',
  });
  return burnCard(card, undefined, 500);
}

/** Flare: the card lifts as it burns away, then the Apply count pulses. */
export async function flare(card: HTMLElement): Promise<void> {
  card.animate([{ transform: 'none' }, { transform: 'translateY(-24px)' }], { duration: 420, easing: 'ease-in', fill: 'forwards' });
  await burnCard(card, undefined, 420);
  pulseApply();
}

function pulseApply() {
  document
    .querySelector<HTMLElement>('nav[aria-label="Sections"] a[href^="#/apply"]')
    ?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
}

/** Burn one card away from `at` (default near its Skip key), then resolve. */
export async function burnCard(card: HTMLElement, at?: Pt, ms = CARD_MS): Promise<void> {
  const box = card.getBoundingClientRect();
  const { svg, show } = overlay(box.width, box.height, getComputedStyle(card).backgroundColor);
  for (const [k, v] of [['left', box.left], ['top', box.top], ['width', box.width], ['height', box.height]] as const)
    svg.style.setProperty(k, `${v}px`);
  svg.style.setProperty('border-radius', getComputedStyle(card).borderRadius);
  document.body.append(svg);
  const c = at ? { x: at.x - box.left, y: at.y - box.top } : { x: box.width * 0.3, y: box.height * 0.85 };
  try {
    await runBurn(box.width, box.height, c, ms, show, (hole) => card.style.setProperty('clip-path', keepClip(box.width, box.height, hole)));
  } finally {
    svg.remove();
    card.style.setProperty('visibility', 'hidden');
  }
}

/** Save: lift the card, shrink it toward the Apply tab, then pulse the tab. */
export async function flyToApply(card: HTMLElement): Promise<void> {
  const tab = document.querySelector<HTMLElement>('nav[aria-label="Sections"] a[href^="#/apply"]');
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
    { duration: CARD_MS, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' },
  );
  await a.finished;
  card.style.setProperty('visibility', 'hidden');
  pulseApply();
}

/** One decision's motion under the open card option; false = plain collapse. */
export function decisionMotion(kind: 'burn' | 'save', card: HTMLElement): Promise<void> | false {
  const o = cardOption();
  if (kind === 'save') return o === 1 ? flyToApply(card) : flare(card);
  if (o === 3) return false;
  return o === 2 ? smoulder(card) : burnCard(card);
}

/** Undo: the card comes back with a quick fade-in. */
export function fadeIn(el: Element) {
  el.animate([{ opacity: 0, transform: 'scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
}
