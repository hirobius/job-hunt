/* eslint-disable react-refresh/only-export-components -- provider + hook co-located by design */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { importFresh } from './staleBuild';

/** The theme burn (src/burn), a lazy chunk off the entry. */
const loadBurn = importFresh(() => import('./burn/burn'));

/** One burn at a time: a second tap while one runs is ignored. */
let burning = false;

/** The burn may run: View Transitions and motion allowed. (Pause animations is checked in the burn's
 *  chunk, which then hands back for an instant swap: motionPref stays off the entry.) */
export const burnAvailable = (): boolean =>
  typeof document !== 'undefined' &&
  'startViewTransition' in document &&
  typeof window.matchMedia === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The browser chrome follows the app's theme, not only the OS: both theme-color metas (index.html
 *  keeps one per OS scheme for first paint) take the page's own background on every swap. */
export function syncThemeColor() {
  if (typeof document === 'undefined' || !document.body) return;
  const bg = getComputedStyle(document.body).backgroundColor;
  if (bg)
    for (const m of document.querySelectorAll('meta[name="theme-color"]'))
      m.setAttribute('content', bg);
}

export type ColorMode = 'light' | 'dark';
const STORAGE_KEY = 'rjb_color_mode';

const ColorModeContext = createContext<{
  mode: ColorMode;
  toggle: () => void;
  /** Toggle with the burn from a point (viewport px); an instant swap where the burn can't run. */
  burnToggle: (at: { x: number; y: number }) => void;
}>({
  mode: 'dark',
  toggle: () => {},
  burnToggle: () => {},
});

export const useColorMode = () => useContext(ColorModeContext);

function storedMode(): ColorMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore */
  }
  return null;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** The OS colour scheme; dark where it can't be read (the app's look before this followed the OS). */
function osMode(): ColorMode {
  if (typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/** Owns the color mode: follows the OS until the user picks one (only a pick is stored), and sets `data-theme` AND the `.dark` class on <html> — HDS
 *  keys its dark tokens on both, so they must agree or light mode picks up dark rules. */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [picked, setPicked] = useState<ColorMode | null>(storedMode);
  const [os, setOs] = useState<ColorMode>(osMode);
  const mode = picked ?? os;

  // HDS 0.39 (hds#1399): `data-hds-theme-switching` on <html> turns every transition off while the
  // theme flips, so colours switch at once instead of fading. Held two frames, as ThemeProvider does.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-hds-theme-switching', '');
    root.setAttribute('data-theme', mode);
    root.classList.toggle('dark', mode === 'dark');
    void root.offsetHeight;
    syncThemeColor();
    const done = () => root.removeAttribute('data-hds-theme-switching');
    if (typeof requestAnimationFrame !== 'function') return done();
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(done);
    });
    return () => {
      cancelAnimationFrame(id);
      done();
    };
  }, [mode]);

  // No pick yet: follow the OS live, so switching it at sunset switches the app too.
  useEffect(() => {
    if (picked || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => setOs(mq.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [picked]);

  const value = useMemo(() => {
    const next: ColorMode = mode === 'dark' ? 'light' : 'dark';
    const toggle = () => {
      setPicked(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    };
    // Inside the View Transition the swap must land in one sync step: the attributes, then React.
    const swap = () => {
      const root = document.documentElement;
      root.setAttribute('data-theme', next);
      root.classList.toggle('dark', next === 'dark');
      flushSync(toggle);
    };
    const burnToggle = (at: { x: number; y: number }) => {
      if (!burnAvailable()) return toggle();
      if (burning) return;
      burning = true;
      void loadBurn()
        .then((b) => b.burnTheme(at, swap))
        .then((ran) => {
          if (!ran) toggle();
        })
        // A chunk that is gone, or a transition that fails before the swap: switch at once.
        .catch(() => {
          if (document.documentElement.getAttribute('data-theme') !== next) toggle();
        })
        .finally(() => {
          burning = false;
        });
    };
    return { mode, toggle, burnToggle };
  }, [mode]);

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}
