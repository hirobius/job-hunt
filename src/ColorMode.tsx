/* eslint-disable react-refresh/only-export-components -- provider + hook co-located by design */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ColorMode = 'light' | 'dark';
const STORAGE_KEY = 'rjb_color_mode';

const ColorModeContext = createContext<{ mode: ColorMode; toggle: () => void }>({
  mode: 'dark',
  toggle: () => {},
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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }, [mode]);

  // No pick yet: follow the OS live, so switching it at sunset switches the app too.
  useEffect(() => {
    if (picked || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => setOs(mq.matches ? 'dark' : 'light');
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [picked]);

  const value = useMemo(
    () => ({
      mode,
      toggle: () => {
        const next: ColorMode = mode === 'dark' ? 'light' : 'dark';
        setPicked(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          /* ignore */
        }
      },
    }),
    [mode],
  );

  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}
