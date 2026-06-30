// Deep store factory — the reactivity plumbing every app store shares, behind one small
// interface. A store holds a single immutable T, replaced wholesale via set(); callers build
// their own domain mutators on top. The factory owns ONLY the state cell, the listener set,
// the snapshot, and the useSyncExternalStore hook.
//
// Persistence is INJECTED, not owned: stores compute their own `initial` (loading/sanitizing
// from storage however they need) and pass an `onSet` that persists however they need — one
// key, two keys, or a projection. That keeps the factory ignorant of localStorage and domain
// rules, so it stays deep (see docs: the five stores persist in five different shapes).
import { useSyncExternalStore } from 'react';

export interface Store<T> {
  /** Subscribe + read in a component (re-renders on change). */
  use(): T;
  /** Read the current value outside React (callers, tests, cloud sync). */
  get(): T;
  /** Replace the value: persist (via onSet) then notify subscribers. */
  set(next: T): void;
  /** Low-level subscription (used by useSyncExternalStore and external listeners). */
  subscribe(listener: () => void): () => void;
}

export function createStore<T>(initial: T, opts: { onSet?: (next: T) => void } = {}): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  const get = () => state;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const set = (next: T) => {
    state = next;
    opts.onSet?.(next);
    listeners.forEach((l) => l());
  };
  const use = () => useSyncExternalStore(subscribe, get, get);

  return { use, get, set, subscribe };
}
