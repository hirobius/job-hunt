/* eslint-disable react-refresh/only-export-components -- provider + hook co-located by design */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { makeTheme } from './theme';

export type ColorMode = 'light' | 'dark';
const STORAGE_KEY = 'rjb_color_mode';

const ColorModeContext = createContext<{ mode: ColorMode; toggle: () => void }>({
  mode: 'dark',
  toggle: () => {},
});

export const useColorMode = () => useContext(ColorModeContext);

function initialMode(): ColorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* ignore */
  }
  return 'dark';
}

/** Owns the color mode: persists it, sets `data-theme` on <html> (HDS 0.9.0 flips its
 *  token variables on [data-theme="dark"]), and provides the matching MUI theme. */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ColorMode>(initialMode);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [mode]);

  const theme = useMemo(() => makeTheme(mode), [mode]);
  const value = useMemo(
    () => ({ mode, toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')) }),
    [mode],
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
