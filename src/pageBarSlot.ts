// The page bar's slot (PageBar.tsx): App owns the element, a page's tools render into it.
import { createContext } from 'react';

export const PageBarSlot = createContext<HTMLElement | null>(null);
