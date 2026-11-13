// View memory (return paths, Adrian 2026-10-22): small bits of on-screen state, like which rows of
// Apply mode were open or a Live postings search, kept for this page load by a key, so a page left
// for a moment (Documents, or a saved posting's page, then Back) comes back as it was. In
// memory only; nothing here is data.
import { useState } from 'react';

const memory = new Map<string, unknown>();

/** What is kept under `key`, else `initial`, kept from now on (a view opened with a prop's value
 *  comes back with it). */
const read = <T>(key: string, initial: T | (() => T)): T => {
  if (memory.has(key)) return memory.get(key) as T;
  const value = typeof initial === 'function' ? (initial as () => T)() : initial;
  memory.set(key, value);
  return value;
};

/** useState that outlives the component: the value is kept under `key` for this page load. A new
 *  key (another track) reads its own value. The setter takes a value or an updater. */
export function useRemembered<T>(
  key: string,
  initial: T | (() => T),
): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState(() => ({ key, value: read(key, initial) }));
  let current = state;
  if (state.key !== key) {
    current = { key, value: read(key, initial) };
    setState(current);
  }
  // Kept at once, not in a state updater: a row that unmounts in the same commit (Done moves a kit
  // field to another list) still leaves its last value behind.
  const set = (v: T | ((prev: T) => T)) => {
    const prev = read(key, initial);
    const value = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
    memory.set(key, value);
    setState({ key, value });
  };
  return [current.value, set];
}

/** Read what is kept under `key` (undefined when nothing is). */
export function recall<T>(key: string): T | undefined {
  return memory.get(key) as T | undefined;
}

/** Keep `value` under `key` without a component (a fetch that answered after its view left). */
export function remember<T>(key: string, value: T): void {
  memory.set(key, value);
}

/** Forget it all (tests start fresh). */
export function resetViewMemory(): void {
  memory.clear();
}
