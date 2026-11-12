// Prototype (proto/theme-burn, for Adrian's look only): one burn mask, used two ways. The theme
// switch burns the old page away from the tap point (a View Transition whose old snapshot is masked
// by a noisy, growing hole with an ember rim); a card burns away the same way before collapseRow
// closes the gap. Save lifts the card toward the Apply tab instead. A lazy chunk (feedback.ts and
// the theme toggle import it on first use); colours are the flame's HDS primitives, read at run time.
import './burn.css';

const THEME_MS = 800;
const CARD_MS = 450;
const SCALE = 0.25; // the mask is drawn at a quarter size and stretched: soft enough, cheap per frame

type Pt = { x: number; y: number };

/** A noisy ring: a few harmonics with random phases, so no two burns share an edge. */
function ringOf() {
  const h = [3, 5, 8, 13, 21].map((k) => ({ k, p: Math.random() * 6.283, a: 0.5 / Math.sqrt(k) }));
  return (theta: number, t: number) =>
    1 + 0.16 * h.reduce((s, { k, p, a }) => s + a * Math.sin(k * theta + p + t * 3), 0);
}

/** Theme variant: A (default) a radial burn from the tap point; B (`?burn=b`) a front rising from
 *  the bottom in flame licks. A runtime switch so both record from one build. */
export const variant = (): 'a' | 'b' => (new URLSearchParams(location.search).get('burn') === 'b' ? 'b' : 'a');

let rising: { w: number; h: number } | null = null;

function tracePath(ctx: CanvasRenderingContext2D, c: Pt, r: number, ring: ReturnType<typeof ringOf>, t: number) {
  ctx.beginPath();
  if (rising) {
    // B: the front's height is r (0 → past the top); licks are the ring's harmonics across x.
    const { w, h } = rising;
    ctx.moveTo(0, h + 40);
    for (let i = 0; i <= 64; i++) {
      const x = (i / 64) * w;
      const lick = (ring((x / w) * Math.PI * 2, t) - 1) * 0.6 * h * 0.35;
      ctx.lineTo(x, h - r + lick);
    }
    ctx.lineTo(w, h + 40);
    ctx.closePath();
    return;
  }
  for (let i = 0; i <= 96; i++) {
    const th = (i / 96) * Math.PI * 2;
    const rr = r * ring(th, t);
    const x = c.x + Math.cos(th) * rr;
    const y = c.y + Math.sin(th) * rr;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function colours(set: 'flame' | 'ash' = 'flame'): string[] {
  const s = getComputedStyle(document.documentElement);
  const names = set === 'ash' ? ['--rjb-ash-1', '--rjb-ash-2', '--rjb-ash-3'] : ['--rjb-burn-1', '--rjb-burn-2', '--rjb-burn-3'];
  return names.map((v) => s.getPropertyValue(v).trim());
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** Run a burn over a w×h box from c: `mask(url)` gets each frame's mask, the rim canvas the glow. */
function runBurn(
  w: number,
  h: number,
  c: Pt,
  ms: number,
  rim: HTMLCanvasElement,
  mask: (url: string) => void,
  set: 'flame' | 'ash' = 'flame',
) {
  const m = document.createElement('canvas');
  m.width = Math.max(1, Math.round(w * SCALE));
  m.height = Math.max(1, Math.round(h * SCALE));
  const mc = m.getContext('2d')!;
  const dpr = devicePixelRatio || 1;
  rim.width = Math.round(w * dpr);
  rim.height = Math.round(h * dpr);
  const rc = rim.getContext('2d')!;
  rc.scale(dpr, dpr);
  const ring = ringOf();
  const far = rising ? h * 1.35 : Math.hypot(Math.max(c.x, w - c.x), Math.max(c.y, h - c.y)) * 1.25;
  const [c1, c2, c3] = colours(set);
  return new Promise<void>((done) => {
    const t0 = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const r = ease(t) * far;
      // Mask: opaque everywhere but the burnt hole.
      mc.globalCompositeOperation = 'source-over';
      mc.clearRect(0, 0, m.width, m.height);
      mc.fillStyle = c1 || 'black';
      mc.fillRect(0, 0, m.width, m.height);
      mc.globalCompositeOperation = 'destination-out';
      mc.save();
      mc.scale(SCALE, SCALE);
      tracePath(mc, c, r, ring, t);
      mc.fill();
      mc.restore();
      mask(`url(${m.toDataURL()})`);
      // Rim: three strokes, outer glow to hot core, fading out in the last fifth.
      rc.clearRect(0, 0, w, h);
      rc.globalAlpha = t > 0.8 ? (1 - t) / 0.2 : 1;
      for (const [col, width, blur] of [[c1, 14, 18], [c2, 7, 10], [c3, 2.5, 4]] as const) {
        rc.strokeStyle = col;
        rc.shadowColor = col;
        rc.shadowBlur = blur;
        rc.lineWidth = width;
        tracePath(rc, c, r, ring, t);
        rc.stroke();
      }
      if (t < 1) requestAnimationFrame(frame);
      else done();
    };
    requestAnimationFrame(frame);
  });
}

function setThemeColor() {
  const bg = getComputedStyle(document.body).backgroundColor;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', bg);
}

/** Burn the old theme away from `at`; `swap` flips the theme (synchronously). */
export async function burnTheme(at: Pt, swap: () => void): Promise<void> {
  const root = document.documentElement;
  const rim = document.createElement('canvas');
  rim.className = 'rjb-burn-rim';
  rim.dataset.root = '';
  rim.setAttribute('aria-hidden', 'true');
  root.setAttribute('data-rjb-burning', '');
  root.style.setProperty('--rjb-burn-mask', 'linear-gradient(black, black)');
  const vt = document.startViewTransition(() => {
    swap();
    setThemeColor();
    document.body.append(rim);
  });
  try {
    await vt.ready;
    rising = variant() === 'b' ? { w: innerWidth, h: innerHeight } : null;
    await runBurn(innerWidth, innerHeight, at, THEME_MS, rim, (url) => root.style.setProperty('--rjb-burn-mask', url));
    await vt.finished;
  } finally {
    rising = null;
    rim.remove();
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

/** Burn one card away from near its Skip key (or rising from the bottom), then resolve. */
export async function burnCard(card: HTMLElement, at?: Pt, set: 'flame' | 'ash' = 'flame', ms = CARD_MS, rise = set === 'ash'): Promise<void> {
  const box = card.getBoundingClientRect();
  const c = at ? { x: at.x - box.left, y: at.y - box.top } : { x: box.width * 0.3, y: box.height * 0.85 };
  const rim = document.createElement('canvas');
  rim.className = 'rjb-burn-rim';
  rim.setAttribute('aria-hidden', 'true');
  for (const [k, v] of [['left', box.left], ['top', box.top], ['width', box.width], ['height', box.height]] as const)
    rim.style.setProperty(k, `${v}px`);
  document.body.append(rim);
  card.style.setProperty('mask-size', '100% 100%');
  rising = rise ? { w: box.width, h: box.height } : null;
  try {
    await runBurn(box.width, box.height, c, ms, rim, (url) => card.style.setProperty('mask-image', url), set);
  } finally {
    rising = null;
    rim.remove();
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
