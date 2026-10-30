// Dialogs most visits never open, each in its own chunk (#371): the sign-in form (SignInHost) and
// Export links (ExportLinksHost) and the Account menu's Companies list and Search profile. Their hosts stay in the shell and fetch them on the first open.
// Follow up, Add interview and Recently removed (#368 pass) load whole on their first open
// (lazyHosts.tsx), and the job page's liveness note with the job page.
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { lazyView } from './lazyView';
import { importFresh } from './staleBuild';

/** A named export as the `{ default }` lazyView takes. */
const named = <P extends object>(c: ComponentType<P>) => ({ default: c });

export const SignInDialog = lazyView(importFresh(() => import('./account/SignInDialog')));
export const ExportLinksDialog = lazyView(importFresh(() => import('./ExportLinksDialog')));
export const CompaniesDialog = lazyView(importFresh(() => import('./CompaniesDialog')));
export const SearchProfileDialog = lazyView(importFresh(() => import('./SearchProfileDialog')));
export const FollowUpHost = lazyView(
  importFresh(async () => named((await import('./FollowUp')).FollowUpHost)),
);
export const AddInterviewHost = lazyView(
  importFresh(async () => named((await import('./AddInterview')).AddInterviewHost)),
);
export const RecentlyRemovedHost = lazyView(
  importFresh(async () => named((await import('./RecentlyRemoved')).RecentlyRemovedHost)),
);
export const JobPageLiveness = lazyView(
  importFresh(async () => named((await import('./LivenessViews')).JobPageLiveness)),
);

/** Fetch both now (the test setup does, so a test sees a dialog on the render that opens it). */
export const preloadDialogs = () =>
  Promise.all(
    [
      SignInDialog,
      ExportLinksDialog,
      CompaniesDialog,
      SearchProfileDialog,
      FollowUpHost,
      AddInterviewHost,
      RecentlyRemovedHost,
      JobPageLiveness,
    ].map((v) => v.preload()),
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
