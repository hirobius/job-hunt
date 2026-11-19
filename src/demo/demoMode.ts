// The demo (#835): "Try a demo" (the sign-in screen, the signed-out Review) or a `?demo=1` link
// (route.ts) opens the app with sample data and no account. The data lives in memory only
// (demoStorage.ts): starting the demo reloads into a demo tab, and leaving it reloads out of it, so
// the visitor's own data is never read or written while it runs. Review shows fictional
// design-systems postings under a note (demoPostings.ts, ReviewView DemoReviewList); Apply gets the
// sample jobs (loadSample.ts). Never with a stored session (its sync would run).
import { importFresh } from '../staleBuild';
import { hasPersistedSession } from '../supabase';
import { resetSignInAsk } from '../signInAsked';
import { DEMO_FLAG, demoActive } from './demoStorage';

const loadSampleModule = importFresh(() => import('./loadSample'));

/** How the page reloads (tests swap it: jsdom can't navigate). */
export const demoReload = { now: () => window.location.reload() };

/** Into a demo tab, on Review. False with a stored session: no demo then. */
export function startDemo(): boolean {
  if (hasPersistedSession()) return false;
  try {
    sessionStorage.setItem(DEMO_FLAG, '1');
  } catch {
    return false; // storage blocked: the demo can't keep its data apart, so none
  }
  window.location.hash = '#/review';
  demoReload.now();
  return true;
}

/** Out of the demo, back to the sign-in screen, with the visitor's own data as it was. */
export function leaveDemo(): void {
  try {
    sessionStorage.removeItem(DEMO_FLAG);
  } catch {
    /* blocked: the reload still drops the in-memory data */
  }
  resetSignInAsk(); // the sign-in screen opens again on Review
  window.location.hash = '#/review';
  demoReload.now();
}

/** In a demo tab: the sample jobs for Apply (in memory), once a load. */
export async function seedDemo(): Promise<void> {
  if (!demoActive()) return;
  const { loadSample } = await loadSampleModule();
  loadSample();
}
