// Dialogs most visits never open, each in its own chunk (#371): the sign-in form (SignInHost) and
// Export links (ExportLinksHost). Their hosts stay in the shell and fetch them on the first open.
import { lazyView } from './lazyView';
import { importFresh } from './staleBuild';

export const SignInDialog = lazyView(importFresh(() => import('./account/SignInDialog')));
export const ExportLinksDialog = lazyView(importFresh(() => import('./ExportLinksDialog')));

/** Fetch both now (the test setup does, so a test sees a dialog on the render that opens it). */
export const preloadDialogs = () =>
  Promise.all([SignInDialog, ExportLinksDialog].map((v) => v.preload()));
