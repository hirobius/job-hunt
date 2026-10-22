// Tab memory (return paths, Adrian 2026-10-22): each top tab reopens where it was left. The
// Pipeline tab holds the list, a job page, Apply mode and a Company page; Companies holds its tools,
// sections and secondary views. In memory for this page load; the URL already carries the page
// showing now. Tapping the open tab goes to its root (App.tsx).
import { buildHash, COMPANY_TAB, getRoute, navigate, parseHash, subscribeRoute } from './route';
import type { Route } from './route';

export type TopTab = 'discover' | 'queue';

/** The top tab a route sits under, or null for a page with no tab (Documents, legal). */
export function tabOf(r: Route): TopTab | null {
  if (r.tab === 'discover') return 'discover';
  if (r.tab === 'queue' || r.tab === 'apply' || r.tab === COMPANY_TAB) return 'queue';
  return null;
}

const last: Partial<Record<TopTab, string>> = {};
/** The job Apply mode last showed, so Start applying can pick up there. */
let lastApply: string | null = null;

function note() {
  const r = getRoute();
  const t = tabOf(r);
  if (t) last[t] = buildHash(r);
  if (r.tab === 'apply' && r.sub) lastApply = r.sub;
}

if (typeof window !== 'undefined') {
  note();
  subscribeRoute(note);
}

/** Where a tab was left (its root before anything under it was visited). */
export function lastRouteOf(tab: TopTab): string {
  return last[tab] ?? `#/${tab}`;
}

/** Open a top tab where it was left, at the scroll it had. */
export function openTab(tab: TopTab): void {
  const r = parseHash(lastRouteOf(tab));
  navigate({ ...r, from: r.from ?? null, section: r.section ?? null }, false, { restore: true });
}

/** The job id Apply mode last showed, or null. */
export const lastApplyJobId = (): string | null => lastApply;

/** Forget every tab's place (tests start fresh). */
export function resetTabMemory(): void {
  delete last.discover;
  delete last.queue;
  lastApply = null;
}
