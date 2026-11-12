// Prototype (proto/theme-burn, for Adrian's look only): one burn front, used two ways. The theme
// switch burns the old page away (a View Transition whose old snapshot is masked by the front's
// hole, with the flame's two cobalt bands drawn over the edge as flat fills); a card burns away the
// same way before collapseRow closes the gap. Save lifts the card toward the Apply tab instead. The
// front is burnField.ts (the flame engine's primitives). A lazy chunk; colours are HDS primitives.
import './burn.css';
import { BURN, createBurn, type BurnFrame, type BurnShape } from './burnField';

const CARD_MS = BURN.cardMs;
type Pt = { x: number; y: number };

/** Theme variant: A (default) a radial burn from the tap point; B (`?burn=b`) a front rising from
 *  the bottom. A runtime switch so both record from one build. */
export const variant = (): 'a' | 'b' => (new URLSearchParams(location.search).get('burn') === 'b' ? 'b' : 'a');

const NS = 'http://www.w3.org/2000/svg';

/** The flame bands over the burning box: flat fills, outer (layer 1) then middle (layer 2). */
function overlay(w: number, h: number) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'rjb-burn-rim');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const paths = ['rjb-burn-outer', 'rjb-burn-middle'].map((cls) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', cls);
    p.setAttribute('fill-rule', 'evenodd');
    svg.append(p);
    return p;
  });
  const show = (f: BurnFrame) => {
    paths[0].setAttribute('d', f.outer + f.middle);
    paths[1].setAttribute('d', f.middle + f.hole);
  };
  return { svg, show };
}

/** The old surface's mask: everything but the hole (vector, so crisp at any pixel ratio). */
const maskOf = (w: number, h: number, hole: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="${NS}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path fill-rule="evenodd" d="M-9,-9H${w + 9}V${h + 9}H-9Z${hole}"/></svg>`,
  )}")`;

/** Frame timing, read by the recording script. */
const stats = ((globalThis as { __burnStats?: number[][] }).__burnStats ??= []);

/** Run a burn over a w×h box: the contour steps at BURN.fps, the page paints at its own rate. */
function runBurn(w: number, h: number, shape: BurnShape, ms: number, show: (f: BurnFrame) => void, mask: (url: string) => void) {
  const frame = createBurn(BURN, w, h, shape);
  const dt = 1000 / BURN.fps;
  const times: number[] = [];
  stats.push(times);
  return new Promise<void>((done) => {
    const t0 = performance.now();
    let next = 0;
    const paint = (now: number) => {
      times.push(now);
      const e = now - t0;
      if (e >= next) {
        next += dt;
        const f = frame(e / ms);
        show(f);
        mask(maskOf(w, h, f.hole));
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

/** Burn the old theme away from `at`; `swap` flips the theme (synchronously). */
export async function burnTheme(at: Pt, swap: () => void): Promise<void> {
  const root = document.documentElement;
  const w = innerWidth,
    h = innerHeight;
  const { svg, show } = overlay(w, h);
  svg.dataset.root = '';
  root.setAttribute('data-rjb-burning', '');
  root.style.setProperty('--rjb-burn-mask', 'linear-gradient(black, black)');
  const vt = document.startViewTransition(() => {
    swap();
    setThemeColor();
    document.body.append(svg);
  });
  try {
    await vt.ready;
    const shape: BurnShape = variant() === 'b' ? { kind: 'rise' } : { kind: 'radial', x: at.x, y: at.y };
    await runBurn(w, h, shape, BURN.themeMs, show, (url) => root.style.setProperty('--rjb-burn-mask', url));
    await vt.finished;
  } finally {
    svg.remove();
    root.removeAttribute('data-rjb-burning');
    root.style.removeProperty('--rjb-burn-mask');
  }
}

/** Card option (runtime switch `?card=1|2|3`, default 1): 1 removals burn + Save lifts to Apply;
 *  2 every decision is flame (Save flares up, removals smoulder to ash); 3 progress only (Save and
 *  Mark applied flare, removals plain collapse). */
export const cardOption = (): 1 | 2 | 3 => {
  const n = Number(new URLSearchParams(location.search).get('card'));
  return n === 2 || n === 3 ? n : 1;
};

/** Smoulder: a slower, dimmer rising burn in ash grey (HDS neutrals), the card greying as it goes. */
export async function smoulder(card: HTMLElement): Promise<void> {
  card.animate([{ filter: 'none', opacity: 1 }, { filter: 'grayscale(1) brightness(.85)', opacity: 0.6 }], {
    duration: 500,
    fill: 'forwards',
  });
  return burnCard(card, undefined, 'ash', 500);
}

/** Flare: the card ignites upward (a bright rising burn) as it lifts, then the Apply count pulses. */
export async function flare(card: HTMLElement): Promise<void> {
  card.animate([{ transform: 'none' }, { transform: 'translateY(-24px)' }], { duration: 420, easing: 'ease-in', fill: 'forwards' });
  await burnCard(card, undefined, 'flame', 420, true);
  pulseApply();
}

function pulseApply() {
  document
    .querySelector<HTMLElement>('nav[aria-label="Sections"] a[href^="#/apply"]')
    ?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
}

/** Burn one card away (from near its Skip key, or rising from the bottom), then resolve. */
export async function burnCard(card: HTMLElement, at?: Pt, set: 'flame' | 'ash' = 'flame', ms = CARD_MS, rise = set === 'ash'): Promise<void> {
  const box = card.getBoundingClientRect();
  const { svg, show } = overlay(box.width, box.height);
  if (set === 'ash') svg.dataset.ash = '';
  for (const [k, v] of [['left', box.left], ['top', box.top], ['width', box.width], ['height', box.height]] as const)
    svg.style.setProperty(k, `${v}px`);
  svg.style.setProperty('border-radius', getComputedStyle(card).borderRadius);
  document.body.append(svg);
  card.style.setProperty('mask-size', '100% 100%');
  const c = at ? { x: at.x - box.left, y: at.y - box.top } : { x: box.width * 0.3, y: box.height * 0.85 };
  const shape: BurnShape = rise ? { kind: 'rise' } : { kind: 'radial', ...c };
  try {
    await runBurn(box.width, box.height, shape, ms, show, (url) => card.style.setProperty('mask-image', url));
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
