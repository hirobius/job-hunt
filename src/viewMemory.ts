// View memory (return paths, Adrian 2026-10-22): small bits of on-screen state, like which rows of
// Apply mode were open, kept for this page load by a key, so a page left for a moment (Edit
// documents, then Back) comes back as it was. In memory only; nothing here is data.
import { useState } from 'react';

const memory = new Map<string, unknown>();

/** useState that outlives the component: the value is kept under `key` for this page load. */
export function useRemembered<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (memory.has(key) ? (memory.get(key) as T) : initial));
  const set = (v: T) => {
    memory.set(key, v);
    setValue(v);
  };
  return [value, set];
}

/** Forget it all (tests start fresh). */
export function resetViewMemory(): void {
  memory.clear();
}
