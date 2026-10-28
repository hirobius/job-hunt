// The shell's route views, each in its own chunk (lazyView.tsx): a first visit to Companies
// doesn't download the Pipeline, the job page, Apply mode or the Company page.
import { lazyView } from './lazyView';
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
