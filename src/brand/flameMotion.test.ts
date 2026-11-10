// The flame moves (endless, 10 fps) wherever it shows: the header and sign-in wordmark
// and the boot hold. Under prefers-reduced-motion it is flame.svg, still. The wordmark's letters
// flicker with it (a slight lean and a 5% fade, Adrian's per-letter setting); transforms and
// opacity only, so the word's box never moves.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLAME } from './flameEngine';
import { flameSvg } from './flameSvg';
import { animateFlame } from './flameMotion';

let reduce = false;
let listeners: (() => void)[] = [];
beforeEach(() => {
  reduce = false;
  listeners = [];
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', (q: string) => ({
    media: q,
    get matches() {
      return q.includes('reduce') && reduce;
    },
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: () => void) =>
      (listeners = listeners.filter((l) => l !== fn)),
  }));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function mount() {
  const host = document.createElement('div');
  host.innerHTML = flameSvg + '<span>S</span><span>t</span>';
  document.body.appendChild(host);
  const svg = host.querySelector('svg')!;
  const letters = [...host.querySelectorAll('span')];
  const ds = () => [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'));
  return { svg, letters, ds, still: ds() };
}
const frame = 1000 / FLAME.fps;

describe('animateFlame', () => {
  it('draws a new frame every 1/fps, never repeating, and stops on cleanup', () => {
    const { svg, letters, ds, still } = mount();
    const stop = animateFlame(svg, letters);
    vi.advanceTimersByTime(frame);
    const a = ds();
    expect(a).not.toEqual(still);
    vi.advanceTimersByTime(frame);
    expect(ds()).not.toEqual(a);
    stop();
    expect(ds()).toEqual(still);
    vi.advanceTimersByTime(frame * 5);
    expect(ds()).toEqual(still);
  });

  it('leaves the letters still while the flame burns (Adrian 2026-11-10: flicker off)', () => {
    expect(FLAME.tOn).toBe('off');
    const { svg, letters, ds, still } = mount();
    const stop = animateFlame(svg, letters);
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(frame);
      for (const l of letters) expect([l.style.transform, l.style.opacity]).toEqual(['', '']);
    }
    expect(ds()).not.toEqual(still);
    stop();
  });

  it('keeps running: still moving a minute in (Adrian: never settles)', () => {
    const { svg, ds, still } = mount();
    const stop = animateFlame(svg);
    vi.advanceTimersByTime(60_000);
    const a = ds();
    expect(a).not.toEqual(still);
    vi.advanceTimersByTime(frame);
    expect(ds()).not.toEqual(a);
    stop();
  });

  it('stays flame.svg, still, under prefers-reduced-motion', () => {
    reduce = true;
    const { svg, letters, ds, still } = mount();
    const stop = animateFlame(svg, letters);
    vi.advanceTimersByTime(frame * 10);
    expect(ds()).toEqual(still);
    expect(letters[0].style.transform).toBe('');
    stop();
  });

  it('stops, back to still, when reduced motion is turned on while it runs', () => {
    const { svg, letters, ds, still } = mount();
    const stop = animateFlame(svg, letters);
    vi.advanceTimersByTime(frame * 3);
    reduce = true;
    listeners.forEach((l) => l());
    expect(ds()).toEqual(still);
    vi.advanceTimersByTime(frame * 3);
    expect(ds()).toEqual(still);
    stop();
    expect(listeners).toEqual([]);
  });

  it('draws nothing while the tab is hidden', () => {
    const { svg, ds } = mount();
    const stop = animateFlame(svg, []);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const before = ds();
    vi.advanceTimersByTime(frame * 5);
    expect(ds()).toEqual(before);
    hidden.mockRestore();
    stop();
  });

  it('does nothing where matchMedia is missing (jsdom, very old browsers)', () => {
    vi.unstubAllGlobals();
    const { svg, ds, still } = mount();
    const stop = animateFlame(svg, []);
    vi.advanceTimersByTime(frame * 5);
    expect(ds()).toEqual(still);
    stop();
  });
});
