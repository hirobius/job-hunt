// Dialogs most visits never open, each in its own chunk (#371): the sign-in form (SignInHost) and
// Export links (ExportLinksHost) and the Account menu's Companies list and Search profile. Their hosts stay in the shell and fetch them on the first open.
import { useEffect, useRef, useState } from 'react';
import { lazyView } from './lazyView';
import { importFresh } from './staleBuild';

export const SignInDialog = lazyView(importFresh(() => import('./account/SignInDialog')));
export const ExportLinksDialog = lazyView(importFresh(() => import('./ExportLinksDialog')));
export const CompaniesDialog = lazyView(importFresh(() => import('./CompaniesDialog')));
export const SearchProfileDialog = lazyView(importFresh(() => import('./SearchProfileDialog')));

/** Fetch both now (the test setup does, so a test sees a dialog on the render that opens it). */
export const preloadDialogs = () =>
  Promise.all(
    [SignInDialog, ExportLinksDialog, CompaniesDialog, SearchProfileDialog].map((v) => v.preload()),
  );

/** True once `view`'s chunk is in, fetched the first time `wanted` is true; the host renders the
 *  view only then, so it never suspends. A chunk that won't load calls `onFail` (close the
 *  sheet) instead of throwing to the app's error boundary; importFresh raises the reload notice. */
export function useLoadedWhen(
  view: { preload(): Promise<void> },
  wanted: boolean,
  onFail: () => void,
): boolean {
  const [ready, setReady] = useState(false);
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  });
  useEffect(() => {
    if (!wanted || ready) return;
    let live = true;
    view.preload().then(
      () => live && setReady(true),
      () => live && failRef.current(),
    );
    return () => {
      live = false;
    };
  }, [view, wanted, ready]);
  return ready;
}
