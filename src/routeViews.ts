// The shell's route views, each in its own chunk (lazyView.tsx): a first visit to Companies
// doesn't download the Pipeline, the job page, Apply mode or the Company page.
import { lazyView } from './lazyView';
import { COMPANY_TAB, type Route } from './route';
import { importFresh } from './staleBuild';

export const TrackerView = lazyView(importFresh(() => import('./TrackerView')));
export const JobPage = lazyView(importFresh(() => import('./JobPage')));
export const ApplyMode = lazyView(importFresh(() => import('./ApplyMode')));
export const CompanyPage = lazyView(importFresh(() => import('./CompanyPage')));
// First run and the no-track gate: most loads never show them, and they carry the starter packs.
const loadOnboarding = importFresh(() => import('./Onboarding'));
export const Onboarding = lazyView<{ offerSample?: boolean }>(() =>
  loadOnboarding().then((m) => ({ default: m.Onboarding })),
);
export const ChooseTrack = lazyView<object>(() =>
  loadOnboarding().then((m) => ({ default: m.ChooseTrack })),
);

/** Fetch every view now (the test setup does, so tests render without a Suspense step). */
export const preloadViews = () =>
  Promise.all(
    [TrackerView, JobPage, ApplyMode, CompanyPage, Onboarding, ChooseTrack].map((v) => v.preload()),
  );

/** The view a route opens on, when it is one of these: the Pipeline or a job under `queue`,
 *  Apply mode (`apply`, App's APPLY_ROUTE) or a Company page. */
export function viewFor(route: Route): { preload(): Promise<void> } | null {
  if (route.tab === 'apply') return ApplyMode;
  if (route.tab === COMPANY_TAB) return CompanyPage;
  if (route.tab === 'queue') return route.jobId ? JobPage : TrackerView;
  return null;
}

/** Load the landing route's view before the first render (main.tsx, #372), so it mounts with the
 *  shell: lazily, its chunk was only asked for once the shell rendered, and the list then rendered
 *  in a second pass behind a skeleton, ~400 ms after first paint on a warm load. Gives up after
 *  `capMs` (a cold load's chunk is a network trip: the skeleton shows as before), or when the
 *  chunk fails (the view's own Suspense and the stale-build notice take it from there). */
export function preloadLanding(route: Route, capMs = 100): Promise<void> {
  const view = viewFor(route);
  if (!view) return Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    view.preload().catch(() => {}),
    new Promise<void>((done) => (timer = setTimeout(done, capMs))),
  ]).finally(() => clearTimeout(timer));
}
