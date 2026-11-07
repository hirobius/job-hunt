// Tab memory (return paths, Adrian 2026-10-22): each top tab reopens where it was left. The
// Apply tab holds the list, a job's Apply view and a Company page. In memory for this page load; the URL already carries the page
// showing now. Tapping the open tab goes to its root (App.tsx).
import {
  APPLY_TAB,
  buildHash,
  COMPANY_TAB,
  FIND_TAB,
  getRoute,
  navigate,
  parseHash,
  subscribeRoute,
} from './route';
import type { Route } from './route';
import { findJobById } from './store';

export type TopTab = typeof FIND_TAB | typeof APPLY_TAB;

/** The top tab a route sits under, or null for a page with no tab (Documents, legal). */
export function tabOf(r: Route): TopTab | null {
  if (r.tab === FIND_TAB) return FIND_TAB;
  if (r.tab === APPLY_TAB || r.tab === COMPANY_TAB) return APPLY_TAB;
  return null;
}

const last: Partial<Record<TopTab, string>> = {};
/** The job the Apply tab last showed, so Find's Resume applying can pick up there. */
let lastApply: string | null = null;

function note() {
  const r = getRoute();
  const t = tabOf(r);
  if (t) last[t] = buildHash(r);
  if (r.tab === APPLY_TAB && r.jobId) lastApply = r.jobId;
}

if (typeof window !== 'undefined') {
  note();
  subscribeRoute(note);
}

/** Where a tab was left (its root before anything under it was visited). */
export function lastRouteOf(tab: TopTab): string {
  return last[tab] ?? `#/${tab}`;
}

/** A job left open that is no longer saved (removed here, or on another device): there is
 *  nothing to reopen, and the job view's fallback would leave the tab. */
const jobGone = (r: Route) => !!r.jobId && !findJobById(r.jobId);

/** Open a top tab where it was left, at the scroll it had; its root when that place is gone. */
export function openTab(tab: TopTab): void {
  const left = parseHash(lastRouteOf(tab));
  const r = jobGone(left) ? parseHash(`#/${tab}`) : left;
  navigate({ ...r, from: r.from ?? null, section: r.section ?? null }, false, { restore: true });
}

/** The job id the Apply tab last showed, or null. */
export const lastApplyJobId = (): string | null => lastApply;

/** Forget every tab's place (tests start fresh). */
export function resetTabMemory(): void {
  delete last.find;
  delete last.apply;
  lastApply = null;
}
