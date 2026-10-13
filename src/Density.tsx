/* eslint-disable react-refresh/only-export-components -- provider + hook co-located by design */
// Layout density (#115): HDS's `data-density="compact"` on <html> steps every density-aware space
// token (surface padding, region gutter, the scale) down one step, and Table follows it. Compact is
// the default — Adrian asked for a dense layout; the account menu switches to comfortable.
// Per device (`rjb_ui_density`); public/theme-init.js applies it before first paint.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Density = 'compact' | 'comfortable';
const STORAGE_KEY = 'rjb_ui_density';

const DensityContext = createContext<{ density: Density; toggle: () => void }>({
  density: 'compact',
  toggle: () => {},
});

export const useDensity = () => useContext(DensityContext);

function initialDensity(): Density {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'comfortable' ? 'comfortable' : 'compact';
  } catch {
    return 'compact';
  }
}

export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensity] = useState<Density>(initialDensity);

  useEffect(() => {
    const root = document.documentElement;
    if (density === 'compact') root.setAttribute('data-density', 'compact');
    else root.removeAttribute('data-density');
    try {
      localStorage.setItem(STORAGE_KEY, density);
    } catch {
      /* storage blocked: this visit only */
    }
  }, [density]);

  const value = useMemo(
    () => ({
      density,
      toggle: () => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact')),
    }),
    [density],
  );
  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}
