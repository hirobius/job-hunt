// The brand flame (Adrian 2026-10-24, the flame logo artifact, version E): hand-drawn
// anime fire, three filled layers (outer, middle, core) with hard cuts between frames, plus embers.
// Live procedural animation: every frame is drawn fresh ("endless"), so it never repeats. Kept as
// code on purpose, never an SVG/image export. Under prefers-reduced-motion (and in automated
// browsers, so screenshot baselines are stable) it shows one fixed frame and does not animate.
// Colours are HDS primitives through `.rjb-flame` in base.css (light / dark).
import { useEffect, useRef, useState } from 'react';
import { BRAND } from '../../brand';
import { S, flameFrames, rng } from './flame';

/** No motion: the user asked for less, or an automated browser (stable screenshots). */
function stillWanted(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return true;
  return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Plays the flame: a new frame at S.fps, or one fixed frame when motion is off. */
function useFlame(): { d: [string, string, string]; tick: number } {
  const [state, setState] = useState(() => ({ d: flameFrames(S.seed)(), tick: 0 }));
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let timer: number | undefined;
    const start = () => {
      window.clearInterval(timer);
      timer = undefined;
      if (stillWanted()) return;
      const next = flameFrames((Math.random() * 1e9) | 0);
      timer = window.setInterval(() => setState((s) => ({ d: next(), tick: s.tick + 1 })), 1000 / S.fps);
    };
    start();
    mq?.addEventListener?.('change', start);
    return () => {
      window.clearInterval(timer);
      mq?.removeEventListener?.('change', start);
    };
  }, []);
  return state;
}

let uid = 0;

/** The flame mark alone. Decorative: whatever sits beside it carries the name. */
export function BrandFlame({ d, className }: { d: [string, string, string]; className?: string }) {
  const [id] = useState(() => `rjb-flame-id-${++uid}`);
  const t = `translate(${S.fx} ${-S.fy}) translate(47 73) scale(${S.fs}) translate(-47 -73)`;
  return (
    <svg viewBox="0 0 94 146" className={['rjb-flame', className].filter(Boolean).join(' ')} aria-hidden="true" focusable="false" overflow="visible">
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={d[0]} />
        </clipPath>
      </defs>
      <g transform={t}>
        <path className="rjb-flame-1" d={d[0]} />
        <g clipPath={`url(#${id}-clip)`}>
          <path className="rjb-flame-2" d={d[1]} />
          <path className="rjb-flame-3" d={d[2]} />
        </g>
      </g>
    </svg>
  );
}

/** The app bar lockup: the flame and the wordmark (the page's one h1), at `fontSize` px. */
export function BrandLogo({ fontSize = 19 }: { fontSize?: number }) {
  const { d, tick } = useFlame();
  const box = useRef<HTMLSpanElement>(null);
  const word = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    box.current?.style.setProperty('--rjb-logo-size', `${fontSize}px`);
  }, [fontSize]);
  // The letters flicker with the flame (version E: a slight skew and fade per letter, per frame).
  useEffect(() => {
    if (!tick || !word.current) return;
    const R = rng(tick * 977 + 99);
    for (const el of word.current.children) {
      const st = (el as HTMLElement).style;
      st.transform = `skewX(${((R() * 2 - 1) * S.tSkew).toFixed(1)}deg)`;
      st.opacity = (1 - R() * S.tFade).toFixed(2);
    }
  }, [tick]);
  return (
    <span className="rjb-logo" ref={box}>
      <BrandFlame d={d} />
      <h1 className="rjb-logo-word" ref={word}>
        {BRAND.name.split('').map((c, i) => (
          <span key={i} className="rjb-logo-letter">
            {c}
          </span>
        ))}
      </h1>
    </span>
  );
}
