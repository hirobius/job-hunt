/* eslint-disable react-refresh/only-export-components -- provider + hook co-located by design */
import { flushSync } from 'react-dom';
import { loadBurn, motionOk } from './feedback';
import { motionPaused } from './motionPref';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ColorMode = 'light' | 'dark';
const STORAGE_KEY = 'rjb_color_mode';

const ColorModeContext = createContext<{
  mode: ColorMode;
  toggle: () => void;
  /** Prototype (proto/theme-burn): toggle with the burn from a point. */
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
    // The swap inside the View Transition must land in one sync step: set the attributes, then flush React.
    const swap = () => {
      const root = document.documentElement;
      root.setAttribute('data-theme', next);
      root.classList.toggle('dark', next === 'dark');
      flushSync(toggle);
    };
    const burnToggle = (at: { x: number; y: number }) => {
      if (!('startViewTransition' in document) || !motionOk() || motionPaused()) return toggle();
      void loadBurn()
        .then((b) => b.burnTheme(at, swap))
        .catch(toggle);
    };
    return { mode, toggle, burnToggle };
  }, [mode]);

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}
