// The demo's storage (#835): in a demo tab the app's data lives in memory only. main.tsx imports
// this module first, so before any store reads localStorage, a demo tab swaps `window.localStorage`
// for a copy in memory: the visitor's own data is hidden, and every write stays in memory and is
// gone on the next load. The real store is never written, so a demo can't change what the visitor
// made. A tab with a stored Supabase session never gets the demo (its sync would run).
// Starting and leaving the demo reload the page (demoMode.ts), so every store loads again.

import { hasPersistedSession } from '../supabase';
import { importFresh } from '../staleBuild';

/** sessionStorage: this tab is a demo tab. */
export const DEMO_FLAG = 'rjb_demo';
/** Display choices the demo shows as the visitor set them (read only: changes stay in memory). */
const SHOWN = ['rjb_color_mode', 'rjb_ui_pause_motion'];

/** Whether this load is a demo: a `?demo=1` link (route.ts) or a demo tab, never with a session. */
export function demoWanted(hash: string, real: Storage): boolean {
  try {
    if (hasPersistedSession(real)) return false;
    return /[?&]demo=1(&|$)/.test(hash) || sessionStorage.getItem(DEMO_FLAG) === '1';
  } catch {
    return false;
  }
}

/** A Storage in memory over `real`: it reads only the display choices from it, never writes. */
export function demoStorageOver(real: Storage): Storage {
  const m = new Map<string, string>();
  const shown = new Map<string, string>();
  for (const k of SHOWN) {
    const v = real.getItem(k);
    if (v !== null) shown.set(k, v);
  }
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? (m.has(k) ? null : (shown.get(k) ?? null)),
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
    removeItem: (k: string) => {
      m.delete(k);
      shown.delete(k);
    },
    clear: () => {
      m.clear();
      shown.clear();
    },
  };
}

let active = false;
let realStorage: Storage | null = null;
/** True in a demo tab, once this module has swapped the storage in. */
export const demoActive = (): boolean => active;

/** Swap the in-memory storage in (on import in a demo tab; tests call it directly). */
export function activateDemoStorage(): void {
  if (active) return;
  realStorage = window.localStorage;
  sessionStorage.setItem(DEMO_FLAG, '1');
  Object.defineProperty(window, 'localStorage', {
    value: demoStorageOver(realStorage),
    configurable: true,
  });
  active = true;
}

/** A demo tab at load: the sign-in screen does not open on its own over it, and Apply gets the
 *  sample jobs (in memory), once the stores have loaded. */
function startDemoTab(): void {
  sessionStorage.setItem('rjb_sign_in_asked', '1'); // signInAsked.ts's key
  void importFresh(() => import('./demoMode'))()
    .then((m) => m.seedDemo())
    .catch(() => {});
}

/** Tests: put the real storage back. */
export function restoreRealStorage(): void {
  if (!active || !realStorage) return;
  Object.defineProperty(window, 'localStorage', { value: realStorage, configurable: true });
  active = false;
  sessionStorage.removeItem(DEMO_FLAG);
}

// Run on import, before any store loads (main.tsx imports this first).
if (typeof window !== 'undefined') {
  try {
    if (demoWanted(window.location.hash, window.localStorage)) {
      activateDemoStorage();
      startDemoTab();
    }
  } catch {
    /* storage blocked: no demo */
  }
}
