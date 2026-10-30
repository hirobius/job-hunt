// A route view loaded on demand: the shell's first load carries only what the landing route
// needs (the Pipeline, the job page, Apply mode and the Company page each come in their own
// chunk). Render it under a Suspense boundary; before its chunk arrives it suspends. `preload()`
// fetches it ahead (the test setup preloads every view, so tests render synchronously).
import { createElement, lazy, useState, type ComponentType } from 'react';

export interface LazyView<P extends object> {
  (props: P): ReturnType<typeof createElement>;
  preload(): Promise<void>;
  /** True once the chunk is in, so a host can render the view on the press itself. */
  loaded(): boolean;
}

export function lazyView<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
): LazyView<P> {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  const preload = () =>
    (pending ??= load().then(
      (m) => {
        loaded = m.default;
      },
      (e: unknown) => {
        pending = null; // a failed chunk fetch (offline) can be retried
        throw e;
      },
    ));
  const Suspending = lazy(() => preload().then(() => ({ default: loaded as ComponentType<P> })));
  function View(props: P) {
    // Fixed per mount: swapping the lazy wrapper for the loaded component later would remount
    // the view and drop its state.
    const [Component] = useState(() => (loaded ?? Suspending) as ComponentType<P>);
    return createElement(Component, props);
  }
  View.preload = preload;
  View.loaded = () => loaded !== null;
  return View;
}
