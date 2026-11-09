// The Feed's progress repaints while a read runs (2026-11-07, 2026-11-09 phone profiles): each
// one rebuilds every posting read so far, so they are spaced out. The first waits REPAINT_MS,
// each next one twice as long, up to REPAINT_MAX_MS. A repaint shows the newest progress (not the
// one that scheduled it), and runs when the main thread is idle (at most REPAINT_MS later).
export const REPAINT_MS = 1000;
export const REPAINT_MAX_MS = 8000;

/** Runs `fn` when the main thread is idle (at most `ms` later); returns a cancel. Without
 *  requestIdleCallback (Safari before 18), a setTimeout 0. */
export function whenIdle(fn: () => void, ms: number): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: ms });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
}

export interface RepaintScheduler<P> {
  /** A new progress: kept as the newest, and a repaint scheduled if none is. */
  push: (p: P) => void;
  /** Drops a scheduled repaint (the read ended, or the effect cleaned up). */
  cancel: () => void;
}

export function repaintScheduler<P>(paint: (p: P) => void): RepaintScheduler<P> {
  let wait = REPAINT_MS;
  let latest: P | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelIdle: (() => void) | undefined;
  let stopped = false;
  return {
    push(p) {
      latest = p;
      if (stopped || timer) return;
      timer = setTimeout(() => {
        cancelIdle = whenIdle(() => {
          timer = undefined;
          cancelIdle = undefined;
          if (!stopped && latest !== undefined) paint(latest);
        }, REPAINT_MS);
      }, wait);
      wait = Math.min(wait * 2, REPAINT_MAX_MS);
    },
    cancel() {
      stopped = true;
      clearTimeout(timer);
      cancelIdle?.();
      timer = undefined;
    },
  };
}
