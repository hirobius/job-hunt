// The page bar's slot: App owns the element. No page renders into it since PageBar.tsx went (#815).
import { createContext } from 'react';

export const PageBarSlot = createContext<HTMLElement | null>(null);
