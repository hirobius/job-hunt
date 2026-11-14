// Feature flags for the redesign phases (#597, epic #564). A phase can ship small behind its
// flag and be turned on when ready. Every flag is ON by default: phases 2 to 6 have shipped, so
// a flag is an off switch for one device, never a gate the user must open.
//
// Per device only: `rjb_ui_flags` in localStorage (an `rjb_ui_*` key, so never synced, never in
// Back up). No third-party service. Tiny on purpose and imported by nothing at start, so the
// entry budget does not move: a component that needs a flag imports `flag` (or `useFlag`).
//
// Turn one off on this device, in the browser console:
//   localStorage.setItem('rjb_ui_flags', JSON.stringify({ p3Find: false })); location.reload()
// or from code: setFlag('p3Find', false). setFlag(name, null) goes back to the default.
import { useSyncExternalStore } from 'react';

/** One flag per redesign phase (#559 to #563). Add a phase here; remove it once it is done. */
export const FLAG_DEFAULTS = {
  /** Phase 2 (#559): named views and the All jobs sheet. */
  p2Views: true,
  /** Phase 3 (#560): Find's compact card and 1440 detail (the Deck went in #714). */
  p3Find: true,
  /** Phase 4 (#561): one-row app bar, Account menu groups, Data dialog. */
  p4Shell: true,
  /** Phase 5 (#562): Add job sheet and grouped Documents. */
  p5Dialogs: true,
  /** Phase 6 (#563): states on the page background, done state, sign-in copy. */
  p6States: true,
} as const satisfies Record<string, boolean>;

export type FlagName = keyof typeof FLAG_DEFAULTS;

export const FLAGS_KEY = 'rjb_ui_flags';
const EVENT = 'rjb-flags';

/** This device's overrides: only known names with boolean values count. Storage blocked or
 *  garbage = no overrides. */
function overrides(): Partial<Record<FlagName, boolean>> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(FLAGS_KEY) ?? '{}');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Partial<Record<FlagName, boolean>> = {};
    for (const name of Object.keys(FLAG_DEFAULTS) as FlagName[]) {
      const v = (raw as Record<string, unknown>)[name];
      if (typeof v === 'boolean') out[name] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Is this flag on, on this device? */
export const flag = (name: FlagName): boolean => overrides()[name] ?? FLAG_DEFAULTS[name];

/** Override a flag on this device; `null` drops the override (back to the default). */
export function setFlag(name: FlagName, on: boolean | null): void {
  const next = overrides();
  if (on === null) delete next[name];
  else next[name] = on;
  try {
    if (Object.keys(next).length) localStorage.setItem(FLAGS_KEY, JSON.stringify(next));
    else localStorage.removeItem(FLAGS_KEY);
  } catch {
    // storage blocked: the default stays
  }
  dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === FLAGS_KEY || e.key === null) onChange();
  };
  addEventListener(EVENT, onChange);
  addEventListener('storage', onStorage);
  return () => {
    removeEventListener(EVENT, onChange);
    removeEventListener('storage', onStorage);
  };
}

/** A flag that re-renders when it changes here or in another tab. */
export const useFlag = (name: FlagName): boolean =>
  useSyncExternalStore(
    subscribe,
    () => flag(name),
    () => FLAG_DEFAULTS[name],
  );
