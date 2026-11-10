// The animated flame logo: the flame engine (flameEngine.ts, a small fire simulation on hard cuts) drawn live,
// with the name's letters flickering on the same clock. It is always the live fire: every frame is drawn fresh and it never repeats.
// Frames sit in a 94x146 box; pieces that break off rise above it
// (overflow: visible).
//
// In the app (App bar, sign-in) it loads lazily (LazyRoleFlameLogo.tsx) behind the still wordmark, so it
// stays out of the entry chunk. Colours are HDS tokens (base.css `.rjb-rf`, light and dark), the font is
// HDS's display type token (Sora 700, loaded by HDS's fonts.css), the name is brand.ts. Stops under prefers-reduced-motion,
// pauses while the tab is hidden; Pause animations and reduced motion stop it (WCAG 2.2.2).
import { CSSProperties, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BRAND } from '../brand';
import { MOTION_EVENT, REDUCE, motionPaused } from '../motionPref';
import {
  FLAME,
  endlessFrames,
  stillFrame,
  type FlameFrame as Frame,
  type FlameSettings,
} from './flameEngine';
// Late shell styles ride this chunk: it always loads just after first paint (the app bar's logo).
import '../theme/late.css';

export type FlameColors = { outer: string; middle: string; core: string };
/** The brand blues are HDS primitives, set on `.rjb-rf` in base.css (light and dark), so one set of
 *  colours follows the theme with no JS: no raw colour in the app. */
const BLUE: FlameColors = {
  outer: 'var(--rjb-rf-1)',
  middle: 'var(--rjb-rf-2)',
  core: 'var(--rjb-rf-3)',
};

/** An endless run from a seed of its own, so no two mounts burn alike. */
const freshEndless = (S: FlameSettings) => endlessFrames(S, (Math.random() * 1e9) | 0);

/* ------------------------------------------------------------------ React */

/** Every change of motionPaused(): the choice here or in another tab (storage), and the system's
 *  reduced-motion setting (which the default follows). */
function onMotionPref(cb: () => void): () => void {
  const mq = window.matchMedia?.(REDUCE);
  window.addEventListener(MOTION_EVENT, cb);
  window.addEventListener('storage', cb);
  mq?.addEventListener?.('change', cb);
  return () => {
    window.removeEventListener(MOTION_EVENT, cb);
    window.removeEventListener('storage', cb);
    mq?.removeEventListener?.('change', cb);
  };
}

/** Pause animations (or reduced motion) as state: the flame and the sign-in screen's toggle. */
// The sign-in screen's toggle reads it too; kept in this chunk so the first load stays as it is
// (its own module was hoisted into the entry chunk).
// eslint-disable-next-line react-refresh/only-export-components
export const useMotionPaused = (): boolean =>
  useSyncExternalStore(onMotionPref, motionPaused, () => false);

/** True while the tab is on screen (document.hidden false). */
function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

/** Current flame frame plus a tick counter, advancing at settings.fps. Pass a stable `settings` object. */
// It burns on everywhere, the sign-in screen too (Adrian 2026-11-09: never stops; was a 5 s limit).
// WCAG 2.2.2 (Pause, Stop, Hide) is met by Pause animations and reduced motion, and a hidden tab
// pauses it.
function useFlame(animated = true, settings: FlameSettings = FLAME) {
  // Reduced motion, or Pause animations in the Account menu (motionPref.ts, WCAG 2.2.2).
  // Paused: the Account menu's choice when made (an explicit Play wins over the system), else the
  // system's reduced-motion setting (motionPref.ts).
  const reduced = useMotionPaused();
  const visible = usePageVisible();
  const on = animated && !reduced;
  const still = useMemo(() => stillFrame(settings), [settings]);
  // One live fire per settings, kept across a pause so a hidden tab resumes where it was.
  const next = useMemo(() => freshEndless(settings), [settings]);
  const ticks = useRef(0);
  const [state, setState] = useState<{ frame: Frame; tick: number }>(() => ({
    frame: still,
    tick: 0,
  }));
  useEffect(() => {
    if (!on || !visible) return;
    const id = window.setInterval(() => {
      setState({ frame: next(), tick: ++ticks.current });
    }, 1000 / settings.fps);
    return () => window.clearInterval(id);
  }, [on, visible, next, settings]);
  // Stopped (reduced motion, Pause animations, or not animated): the still mark, held.
  return on ? { ...state, running: true } : { frame: still, tick: 0, running: false };
}

type SvgProps = {
  size?: number | string;
  colors?: FlameColors;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

// Dynamic styles are built here, not written inline (hdsOnly.test.ts counts inline style literals): the flame's
// box follows the font size, and each letter's pose changes every frame.
const svgStyle = (size: number | string, extra?: CSSProperties): CSSProperties => ({
  height: size,
  width: 'auto',
  overflow: 'visible',
  ...extra,
});
const rootStyle = (px: number, extra?: CSSProperties): CSSProperties => ({
  ['--rjb-rf-size' as string]: `${px}px`,
  ...extra,
});
const letterStyle = (transform: string, opacity: number, ease: number): CSSProperties => ({
  transform,
  opacity,
  transition: ease ? `transform ${ease}ms ease-out, opacity ${ease}ms ease-out` : undefined,
});

function FlameSvg({
  frame,
  size = 32,
  colors = BLUE,
  className,
  style,
  title,
}: SvgProps & { frame: Frame }) {
  // Each layer is its own heat field (flameEngine.ts), so they stack; none is clipped to another.
  const [outer, middle, core] = frame;
  return (
    <svg
      viewBox="0 0 94 146"
      className={className}
      style={svgStyle(size, style)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d={outer} fill={colors.outer} fillRule="evenodd" />
      <path d={middle} fill={colors.middle} fillRule="evenodd" />
      <path d={core} fill={colors.core} fillRule="evenodd" />
    </svg>
  );
}

type FlameProps = SvgProps & {
  animated?: boolean;
  settings?: FlameSettings;
  /** Drive the flame from outside with a frame from useFlame (e.g. to sync with text). */
  frame?: Frame;
};

function SelfDrivenFlame({ animated, settings, ...svg }: Omit<FlameProps, 'frame'>) {
  const { frame } = useFlame(animated, settings);
  return <FlameSvg {...svg} frame={frame} />;
}

/** Just the flame. Height = flame body; pieces that break off rise above. */
export function RoleFlameMark({ frame, animated = true, settings = FLAME, ...svg }: FlameProps) {
  if (frame) return <FlameSvg {...svg} frame={frame} />;
  return <SelfDrivenFlame {...svg} animated={animated} settings={settings} />;
}

// Small deterministic hash so each letter's flicker is stable within a tick.
function hash(tick: number, i: number, salt: number) {
  let t = (tick * 374761393 + i * 668265263 + salt * 2246822519) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/** Wordmark flicker. Units: shake/bob in hundredths of an em, skew in degrees, scale in %. */
const TEXT_SETTINGS = {
  text: BRAND.name,
  flameScale: 1.5,
  skew: 2.5,
  fade: 0.05,
  shake: 0,
  bob: 3,
  bobDir: 'up' as 'up' | 'both',
  scale: 0,
  /** % of letters that move on each frame. */
  pct: 100,
  /** Move every N flame frames. */
  every: 1,
  /** Transition ms between poses (0 = hard cut). */
  ease: 0,
};
export type TextSettings = typeof TEXT_SETTINGS;

type LogoProps = {
  /** Wordmark font size in px. */
  fontSize?: number;
  animated?: boolean;
  colors?: FlameColors;
  settings?: FlameSettings;
  text?: Partial<TextSettings>;
  /** "inline" = flame beside the name (app bar). "stacked" = flame centred above the name (sign-in screen). */
  layout?: 'inline' | 'stacked';
  className?: string;
  style?: CSSProperties;
};

/** Flame + the name, with per-letter flicker, all on one clock. */
export function RoleFlameLogo({
  fontSize = 20,
  animated = true,
  colors = BLUE,
  settings = FLAME,
  text,
  layout = 'inline',
  className,
  style,
}: LogoProps) {
  const T = { ...TEXT_SETTINGS, ...text };
  const { frame, tick, running } = useFlame(animated, settings);
  const [salt] = useState(() => (Math.random() * 1e6) | 0);
  const step = Math.floor(tick / Math.max(1, T.every));
  return (
    <span
      className={['rjb-rf', className].filter(Boolean).join(' ')}
      data-layout={layout}
      role="img"
      aria-label={BRAND.name}
      style={rootStyle(fontSize, style)}
    >
      <FlameSvg
        frame={frame}
        size={`${(layout === 'stacked' ? 1.6 : 1.3) * T.flameScale}em`}
        colors={colors}
      />
      <span aria-hidden="true">
        {T.text.split('').map((c, i) => {
          // A letter keeps its last pose on frames where it isn't picked; we approximate that by
          // looking back to the most recent step in which it was picked.
          let s = step;
          if (T.pct < 100) {
            for (let back = 0; back < 12 && hash(s + salt, i, 9) * 100 >= T.pct; back++) s--;
          }
          const h = (k: number) => hash(s + salt, i, k);
          // The letters stand still unless the settings ask for the flicker (Adrian 2026-11-10: off).
          const on = running && s > 0 && settings.tOn === 'letters';
          const sk = on ? (h(1) * 2 - 1) * T.skew : 0;
          const dx = on ? ((h(2) * 2 - 1) * T.shake) / 100 : 0;
          const dy = on ? ((T.bobDir === 'up' ? -h(4) : h(4) * 2 - 1) * T.bob) / 100 : 0;
          const sc = on ? 1 + ((h(5) * 2 - 1) * T.scale) / 100 : 1;
          const op = on ? 1 - h(3) * T.fade : 1;
          return (
            <span
              key={i}
              className="rjb-rf-l"
              style={letterStyle(
                `translate(${dx.toFixed(3)}em, ${dy.toFixed(3)}em) skewX(${sk.toFixed(2)}deg) scale(${sc.toFixed(3)})`,
                op,
                T.ease,
              )}
            >
              {c}
            </span>
          );
        })}
      </span>
    </span>
  );
}

export default RoleFlameLogo;
