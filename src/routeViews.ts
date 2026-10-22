// The shell's route views, each in its own chunk (lazyView.tsx): a first visit to Companies
// doesn't download the Pipeline, the job page, Apply mode or the Company page.
import { lazyView } from './lazyView';

export const TrackerView = lazyView(() => import('./TrackerView'));
export const JobPage = lazyView(() => import('./JobPage'));
export const ApplyMode = lazyView(() => import('./ApplyMode'));
export const CompanyPage = lazyView(() => import('./CompanyPage'));

/** Fetch every view now (the test setup does, so tests render without a Suspense step). */
export const preloadViews = () =>
  Promise.all([TrackerView, JobPage, ApplyMode, CompanyPage].map((v) => v.preload()));
