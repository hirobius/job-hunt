// Dialogs most visits never open, each in its own chunk (#371): the sign-in form (SignInHost) and
// Export links (ExportLinksHost) and the Account menu's Companies list, Search profile, Scan details and Data. Their hosts stay in the shell and fetch them on the first open.
// Follow up, Add interview and Recently removed (#368 pass) load whole on their first open
// (lazyHosts.tsx), and the job page's liveness note with the job page.
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { lazyView } from './lazyView';
import { importFresh } from './staleBuild';

/** A named export as the `{ default }` lazyView takes. */
const named = <P extends object>(c: ComponentType<P>) => ({ default: c });

export const SignInDialog = lazyView(importFresh(() => import('./account/SignInDialog')));
export const MergeConfirmDialog = lazyView(importFresh(() => import('./account/AuthGuards')));
export const LinkConfirmScreen = lazyView(importFresh(() => import('./account/LinkConfirmScreen')));
export const ExportLinksDialog = lazyView(importFresh(() => import('./ExportLinksDialog')));
export const CompaniesDialog = lazyView(importFresh(() => import('./CompaniesDialog')));
export const SearchProfileDialog = lazyView(importFresh(() => import('./SearchProfileDialog')));
export const ScanDetailsDialog = lazyView(importFresh(() => import('./ScanDetailsDialog')));
// The Account menu's Data dialog (#550): back up, restore, export, Recently removed, reset.
export const DataDialog = lazyView(importFresh(() => import('./account/DataDialog')));
export const FollowUpHost = lazyView(
  importFresh(async () => named((await import('./FollowUp')).FollowUpHost)),
);
export const AddInterviewHost = lazyView(
  importFresh(async () => named((await import('./AddInterview')).AddInterviewHost)),
);
export const RecentlyRemovedHost = lazyView(
  importFresh(async () => named((await import('./RecentlyRemoved')).RecentlyRemovedHost)),
);
// The Documents and Privacy and terms dialogs (#471 slice 4), rendered under App's Suspense with a
// DialogHold fallback. Preloaded in tests: the hold is a dialog of the same name, so a test that
// found it before the chunk landed held a node the real dialog then replaced.
export const DocumentsView = lazyView(importFresh(() => import('./DocumentsView')));
export const LegalPage = lazyView(importFresh(() => import('./LegalPage')));

/** Fetch both now (the test setup does, so a test sees a dialog on the render that opens it). */
export const preloadDialogs = () =>
  Promise.all(
    [
      SignInDialog,
      LinkConfirmScreen,
      MergeConfirmDialog,
      ExportLinksDialog,
      CompaniesDialog,
      SearchProfileDialog,
      ScanDetailsDialog,
      DataDialog,
      FollowUpHost,
      AddInterviewHost,
      RecentlyRemovedHost,
      DocumentsView,
      LegalPage,
    ].map((v) => v.preload()),
  );

/** True once `view`'s chunk is in, fetched the first time `wanted` is true; the host renders the
 *  view only then, so it never suspends. A chunk that won't load calls `onFail` (close the
 *  sheet) instead of throwing to the app's error boundary; importFresh raises the reload notice. */
export function useLoadedWhen(
  view: { preload(): Promise<void>; loaded(): boolean },
  wanted: boolean,
  onFail: () => void,
): boolean {
  // A chunk already in (preloaded as its menu opened) is ready on the press's own render: waiting
  // for the effect and the promise added a second render pass before the dialog painted (#212).
  const [fetched, setReady] = useState(false);
  const ready = fetched || view.loaded();
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
