// Lightweight hash-based routing — no react-router. The URL hash mirrors the app's
// navigable state so refresh and back/forward restore it:
//
//   #/<tab>[/<sub>][?pillar=<id>]      #/apply/<jobId>
//   #/find · #/apply · #/apply/k3x9a1 · #/apply/company/acme (#471: two tabs, Find and Apply)
//
// A tiny external store over `hashchange` (mirrors src/store.ts), read via useSyncExternalStore.
// `tab`/`sub` are opaque slugs the app maps to its own views; `pillar` is the active career
// pillar id. Quick-add deep links (?add/?applied/?status) stay in the query string and are
// handled in App.tsx — they are independent of this hash route.
import { useSyncExternalStore } from 'react';

export interface Route {
  /** Top-level tab slug (e.g. 'find', 'apply'); '' when the hash carries no route. */
  tab: string;
  /** Nested sub-tab slug (Discover's inner tabs), or null. */
  sub: string | null;
  /** Active career-pillar id, or null. */
  pillar: string | null;
  /** The job a `#/apply/<jobId>` route opens (store.jobIdOf), or null. Its own field — the second
   *  segment means a job under `apply` and a sub-tab everywhere else (#127, #471). */
  jobId: string | null;
  /** The page this one was opened from, as a hash path (`/apply/k3x9a1`), when a
   *  key action jumped here (return paths, Adrian 2026-10-22). The page's Back names it and goes
   *  there; left out, Back goes to the page's default. In the URL, so back/forward and reload keep
   *  it. Built by `withOrigin`, read by `originOf`. */
  from?: string | null;
  /** A job page's open section (`screening`, `interviews`; Overview is the default and left out). */
  section?: string | null;
  /** The Documents dialog over the page (#471 slice 4): '' the library, else a document's id or
   *  `new/<kind>`. In the URL (`?documents=`), so a link to it opens it and a reload keeps it. */
  documents?: string | null;
  /** The Legal dialog over the page (#471 slice 4): `privacy` or `terms` (`?legal=`). */
  legal?: string | null;
}

/** The Apply tab (#471): its second segment is a job id, `#/apply/<jobId>`. */
export const APPLY_TAB = 'apply';
/** The Apply tab's second segment for a Company: `#/apply/company/<slug>` (#471 slice 2). */
const COMPANY_SEG = 'company';
/** The Find tab (#471, was Today). */
export const FIND_TAB = 'find';
const JOB_TAB = APPLY_TAB;

/** Parse a raw `location.hash` string into a Route. Pure — exported for tests. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const at = raw.indexOf('?');
  const path = at < 0 ? raw : raw.slice(0, at);
  const query = at < 0 ? '' : raw.slice(at + 1);
  const seg = path.split('/').filter(Boolean);
  const qp = new URLSearchParams(query);
  const tab = seg[0] || '';
  // Every segment after the tab is the sub (`#/copy-deck/new/outreach`); ids and slugs are escaped,
  // so they never hold a slash of their own.
  const second = seg.slice(1).join('/') || null;
  // `#/apply/company/<slug>` is a Company in the Apply tab (#471 slice 2): its sub, not a job.
  const isCompany = tab === JOB_TAB && seg[1] === COMPANY_SEG;
  const isJob = tab === JOB_TAB && second !== null && !isCompany;
  const from = qp.get('from');
  const documents = qp.get('documents');
  const legal = qp.get('legal');
  // The old job tab's section rides along to its redirect.
  const section = isJob || (tab === OLD_QUEUE && second !== null) ? qp.get('section') : null;
  return {
    tab,
    sub: isJob ? null : second,
    pillar: qp.get('pillar'),
    jobId: isJob ? second : null,
    // Only when present, so a plain route reads as it always has.
    ...(from ? { from } : {}),
    ...(section ? { section } : {}),
    ...(documents !== null ? { documents } : {}),
    ...(legal ? { legal } : {}),
  };
}

/** Home: an empty hash and every retired route land here. */
export const HOME_TAB = FIND_TAB;
/** Routes that land on Find (simplify Q6, #471): the old Today slug, the Companies tab
 *  (`discover`, every tool, section and secondary view under it) and the old Trades slug. */
const TO_FIND = new Set(['today', 'discover', 'apprenticeships']);
/** The Apply tab's old slug (#471): the Pipeline list and every job page under it. */
const OLD_QUEUE = 'queue';
/** A Company's old page, `#/company/<slug>` (#230), now `#/apply/company/<slug>`. */
const OLD_COMPANY = 'company';
/** The old Documents page (`#/copy-deck[/<id>]`) and legal pages (`#/legal/<doc>`): dialogs now. */
const OLD_DOCUMENTS = 'copy-deck';
const OLD_LEGAL = 'legal';

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** The page a dialog opened from an old link sits over: the page the link came from, else Find. */
function pageUnder(r: Route): Route {
  const o = r.from ? parseHash('#' + r.from) : null;
  const base = o ? (redirectOf(o) ?? o) : { tab: HOME_TAB, sub: null, pillar: null, jobId: null };
  const { documents: _d, legal: _l, ...page } = base;
  return page;
}

/** Where an old route goes instead, or null for a live one. Pure. The redirect lives here only:
 *  the snapshot reads an old hash as its new route, the URL is rewritten in place (no history step
 *  of its own) and `navigate` never writes one. `#/today` → `#/find`, `#/queue` → `#/apply`,
 *  `#/queue/<id>` → `#/apply/<id>` (its origin kept), `#/company/<slug>` →
 *  `#/apply/company/<slug>`, the Companies tab → `#/find`, `#/copy-deck/<id>` and `#/legal/<doc>` →
 *  the page they were opened from (else Find) with the Documents or Legal dialog over it. */
export function redirectOf(r: Route): Route | null {
  if (r.tab === OLD_DOCUMENTS) return { ...pageUnder(r), documents: r.sub ? decode(r.sub) : '' };
  if (r.tab === OLD_LEGAL) return { ...pageUnder(r), legal: r.sub || 'privacy' };
  if (TO_FIND.has(r.tab)) return { tab: HOME_TAB, sub: null, pillar: null, jobId: null };
  // A Company's page moved into the Apply tab (#471 slice 2).
  if (r.tab === OLD_COMPANY && r.sub)
    return {
      tab: APPLY_TAB,
      sub: `${COMPANY_SEG}/${r.sub}`,
      pillar: r.pillar,
      jobId: null,
      ...(r.from ? { from: r.from } : {}),
    };
  if (r.tab === OLD_QUEUE)
    return {
      tab: APPLY_TAB,
      sub: null,
      pillar: r.pillar,
      jobId: r.sub,
      ...(r.from ? { from: r.from } : {}),
      ...(r.sub && r.section ? { section: r.section } : {}),
    };
  return null;
}

/** Supabase's email link signs in through the hash (`#access_token=…`, implicit flow), and an
 *  expired or used link comes back as `#error=…`. That is a callback for auth-js to read and
 *  clear, not a route: a slug never holds `=`. Leave the hash alone (the tokens are in it). */
export function isAuthCallback(route: Route): boolean {
  return route.tab.includes('=');
}

/** Serialize a Route back into a `#/...` hash string. Pure — exported for tests. */
export function buildHash(r: Route): string {
  const second = r.tab === JOB_TAB ? (r.jobId ?? r.sub) : r.sub;
  const path = [r.tab, second].filter(Boolean).join('/');
  const qp = new URLSearchParams();
  if (r.pillar) qp.set('pillar', r.pillar);
  if (r.section && r.tab === JOB_TAB && r.jobId) qp.set('section', r.section);
  if (r.from) qp.set('from', r.from);
  if (r.documents !== null && r.documents !== undefined) qp.set('documents', r.documents);
  if (r.legal) qp.set('legal', r.legal);
  const q = qp.toString();
  return '#/' + path + (q ? '?' + q : '');
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// ---- History entries (return paths) --------------------------------------------------------------
// Each history entry this tab makes carries a small record in `history.state.rjb`: a key, the hashes
// of the entries before it (the trail, newest last) and its own hash. Back uses the trail to pop to
// the page it returns to when that page is just behind (so the browser's Back doesn't bounce into
// the page just left), and a hash change onto an entry that already has a record is a revisit
// (back/forward), whose scroll position is restored. A sheet (a dialog or menu) can push an entry
// of its own with the same URL, so the browser's Back closes it instead of leaving the page.
interface Entry {
  key: string;
  trail: string[];
  hash: string;
  /** Set on an entry a sheet pushed: the sheet's id and what it needs to reopen as it was. */
  sheet?: string;
  data?: unknown;
  /** The sheets open on this page, one entry each, bottom first (the last is `sheet`): a sheet over
   *  a sheet (Delete track over Manage track). */
  sheets?: string[];
}
const TRAIL_MAX = 12;
let keySeq = 0;
const newKey = () => `${Date.now().toString(36)}.${++keySeq}`;
let entry: Entry | null = null;
/** The sheets open on an entry's page, bottom first. */
const sheetsOf = (e: Entry | null): string[] => (e?.sheet ? (e.sheets ?? [e.sheet]) : []);
/** Pops this module asked the browser for (a sheet's entry, a Back to an earlier page) that
 *  haven't landed yet. A Back is single-flight: until its pop lands, the page on screen is the one
 *  being left, so a second Back (a double click, or a fallback effect in the same tick as a Remove)
 *  would pop again from there and overshoot. */
let pendingBack = 0;
/** Navigations waiting for those pops (a push now would land before them). They run once the pop
 *  has landed, so a repeat Back finds it is already there and does nothing. */
let afterPops: (() => void)[] = [];
/** The pop in flight changes the hash: it has landed once its hashchange has run (popstate fires
 *  first), so the entry record and the scroll restore are done before anything waiting runs. */
let awaitingHash = false;
/** The hash this module last saw, to tell a pop that changes it from one that doesn't. */
let knownHash = typeof window !== 'undefined' ? window.location.hash : '';
/** A pop that never lands (a stale trail asking for an entry that isn't there) must not hold every
 *  navigation forever: after this long the wait is dropped. */
const POP_GRACE_MS = 2000;
let popTimer: ReturnType<typeof setTimeout> | undefined;
const restoreListeners = new Set<(hash: string) => void>();
/** The page was reloaded onto an entry this tab had already marked (its scroll can come back). */
let reloadedEntry = false;

const stateObject = (): Record<string, unknown> => {
  const s: unknown = typeof window !== 'undefined' ? window.history.state : null;
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
};
function readEntry(): Entry | null {
  const e = stateObject().rjb as Entry | undefined;
  return e && typeof e.key === 'string' && Array.isArray(e.trail) ? e : null;
}
function writeEntry(e: Entry, url?: string) {
  window.history.replaceState({ ...stateObject(), rjb: e }, '', url);
  entry = e;
}
const hashOf = (url: string | undefined): string | null => {
  if (url == null) return null;
  const i = url.indexOf('#');
  const h = i < 0 ? '' : url.slice(i);
  return h === '#' ? '' : h;
};
/** Ask for the scroll position a page had (a revisit, a Back, a tab reopening where it was). */
export function requestScrollRestore(hash: string): void {
  restoreListeners.forEach((l) => l(hash));
}
/** The scroll memory listens here (scrollMemory.ts). */
export function subscribeScrollRestore(cb: (hash: string) => void): () => void {
  restoreListeners.add(cb);
  return () => {
    restoreListeners.delete(cb);
  };
}
/** True when this load is a reload of an entry this tab had already visited. */
export const wasReloaded = () => reloadedEntry;

/** True while a pop this module asked for (a Back, a sheet closing) hasn't landed yet. */
export const backInFlight = () => pendingBack > 0;

/** Ask the browser for a pop, holding navigation until it lands. */
function startPop(pop: () => void) {
  pendingBack++;
  clearTimeout(popTimer);
  popTimer = setTimeout(() => {
    // One more task before giving up: when the main thread was stalled past the grace (a busy
    // machine), this timer can run before the pop's own task, still queued behind it, and dropping
    // the wait then let a double click's second Back pop again from the page being left (an
    // overshoot). The hop lets that task run first; a pop that never lands is dropped right after.
    popTimer = setTimeout(() => {
      if (pendingBack === 0) return;
      pendingBack = 1;
      awaitingHash = false;
      popLanded();
    }, 0);
  }, POP_GRACE_MS);
  pop();
}

/** A pop landed: when it was the last one, run what was waiting for it. */
function popLanded() {
  if (pendingBack > 0 && --pendingBack === 0) {
    clearTimeout(popTimer);
    const run = afterPops;
    afterPops = [];
    run.forEach((f) => f());
  }
}

/** An old hash in the address bar becomes its new one, in place (replaceState: no hashchange). */
function rewriteRetired() {
  const to = redirectOf(parseHash(window.location.hash));
  if (!to) return;
  const h = buildHash(to);
  window.history.replaceState(
    window.history.state,
    '',
    window.location.pathname + window.location.search + h,
  );
}

if (typeof window !== 'undefined') {
  rewriteRetired();
  const found = readEntry();
  if (found) {
    entry = { ...found, hash: window.location.hash };
    reloadedEntry = true;
  } else writeEntry({ key: newKey(), trail: [], hash: window.location.hash });

  window.addEventListener('popstate', () => {
    const e = readEntry();
    if (e) entry = e;
    else if (entry && window.location.hash === entry.hash)
      // An entry with this URL that this tab never marked: start a record for it.
      writeEntry({ key: newKey(), trail: [], hash: window.location.hash });
    if (pendingBack === 0) return;
    // A pop onto another hash lands with its hashchange, still to come; a sheet's pop (same URL)
    // has landed now.
    if (window.location.hash !== knownHash) awaitingHash = true;
    else popLanded();
  });

  window.addEventListener('hashchange', (ev) => {
    rewriteRetired();
    const found = readEntry();
    if (found) {
      // Back or forward onto a page already visited: bring its scroll back.
      entry = found;
      requestScrollRestore(window.location.hash);
    } else {
      const oldHash = hashOf((ev as HashChangeEvent).oldURL) ?? entry?.hash ?? '';
      const base = entry && entry.hash === oldHash ? entry.trail : [];
      writeEntry({
        key: newKey(),
        trail: [...base, oldHash].slice(-TRAIL_MAX),
        hash: window.location.hash,
      });
    }
    knownHash = window.location.hash;
    emit();
    if (awaitingHash) {
      awaitingHash = false;
      popLanded();
    }
  });
}

// Cache the parsed snapshot so useSyncExternalStore gets a stable reference between changes.
let snapHash = typeof window !== 'undefined' ? window.location.hash : '';
let snap: Route = parseHash(snapHash);
snap = redirectOf(snap) ?? snap;

function getSnapshot(): Route {
  const h = window.location.hash;
  if (h !== snapHash) {
    snapHash = h;
    const r = parseHash(h);
    snap = redirectOf(r) ?? r;
  }
  return snap;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Listen for route changes outside React (the save notice drops itself on navigation). */
export const subscribeRoute = subscribe;

/** Swap the current history entry for a route (keeping its record, dropping any sheet mark).
 *  `search` replaces the query string too (a quick-add link's params, once handled). */
function replaceRoute(h: string, search = window.location.search) {
  const e = entry ?? { key: newKey(), trail: [], hash: '' };
  writeEntry({ key: e.key, trail: e.trail, hash: h }, window.location.pathname + search + h);
  knownHash = h;
  emit(); // replaceState doesn't fire hashchange
}

/** Merge a partial route into the current one and write it to the URL hash.
 *  `replace` swaps the history entry (no new back-stack step) instead of pushing; `restore` brings
 *  back the scroll position the page had. An origin (`from`) and a job's section belong to their
 *  page: moving to another page drops them unless the patch names them. A navigation from an open
 *  sheet replaces the sheet's own entry, so Back doesn't reopen it. */
export function navigate(
  patch: Partial<Route>,
  replace = false,
  opts: {
    restore?: boolean;
    /** Replace the query string as well (`''` drops it; implies replace). Only through here, so
     *  this module always knows the hash it is on (a raw replaceState left a sheet's pop waiting
     *  ~2 s for a hashchange that never came). */
    search?: string;
  } = {},
): void {
  if (pendingBack > 0) {
    afterPops.push(() => navigate(patch, replace, opts));
    return;
  }
  const open = sheetsOf(entry);
  if (open.length > 1) {
    // From a sheet over a sheet: down to the first one's entry, which the page then replaces.
    startPop(() => window.history.go(1 - open.length));
    afterPops.push(() => navigate(patch, replace, opts));
    return;
  }
  const cur = getSnapshot();
  const asked: Route = { ...cur, ...patch };
  // A job id belongs to the tab it was opened in: switching tabs without naming a job drops it
  // (before the redirect, which may make one from an old route's sub: #/queue/<id>).
  if (patch.tab !== undefined && patch.tab !== cur.tab && !('jobId' in patch)) asked.jobId = null;
  const next: Route = { ...(redirectOf(asked) ?? asked) };
  const moved = pageKey(next) !== pageKey(cur);
  if (moved && !('from' in patch)) next.from = null;
  if (moved && !('section' in patch)) next.section = null;
  // A dialog belongs to the page under it: another page closes it unless the patch names one.
  if (moved && !('documents' in patch)) next.documents = null;
  if (moved && !('legal' in patch)) next.legal = null;
  const h = buildHash(next);
  const search = opts.search ?? window.location.search;
  if (h === window.location.hash && search === window.location.search) return;
  if (opts.restore) requestScrollRestore(h);
  if (replace || entry?.sheet || opts.search !== undefined) replaceRoute(h, search);
  else window.location.hash = h; // fires hashchange → emit via listener
}

/** Go back to `target`: pop to it when it is an earlier entry in this tab's history (matched by
 *  page, so it comes back exactly as it was left), else replace the current entry with it. Either
 *  way its scroll position comes back. A list names pages that are the same view (Companies at
 *  `#/discover` and `#/discover/teams`): the nearest one behind wins, else the first.
 *  Single-flight: asked again before a pop has landed, it waits for it, and on the target page
 *  already it does nothing, so a double click or a click plus a fallback goes back once. */
export function goBackTo(target: Route | Route[]): void {
  if (pendingBack > 0) {
    afterPops.push(() => goBackTo(target));
    return;
  }
  const targets = (Array.isArray(target) ? target : [target]).map((t) => redirectOf(t) ?? t);
  const want = new Set(targets.map(pageKey));
  if (want.has(pageKey(getSnapshot()))) return;
  const trail = entry?.trail ?? [];
  for (let i = trail.length - 1; i >= 0; i--) {
    if (want.has(pageKey(parseHash(trail[i])))) {
      const delta = i - trail.length;
      startPop(() => window.history.go(delta));
      return;
    }
  }
  const h = buildHash(targets[0]);
  requestScrollRestore(h);
  const open = sheetsOf(entry);
  if (open.length) {
    // Open sheets' entries (a menu item asked for this) sit on the page's own: drop them first, so
    // the target takes the page's place and Back never lands on the page just left.
    startPop(() => window.history.go(-open.length));
    afterPops.push(() => {
      if (h !== window.location.hash) replaceRoute(h);
    });
    return;
  }
  if (h !== window.location.hash) replaceRoute(h);
}

/** Go back from the current page: to its recorded origin, else to `fallback` (its default). */
export function goBack(fallback: Route): void {
  goBackTo(originOf(getSnapshot()) ?? fallback);
}

// ---- Sheets ----------------------------------------------------------------------------------------
/** Push an entry for an open sheet (same URL), so the browser's Back closes it (useBackCloses). */
export function pushSheet(id: string, data?: unknown): void {
  const cur = entry ?? { key: newKey(), trail: [], hash: window.location.hash };
  const e: Entry = {
    key: newKey(),
    trail: [...cur.trail, cur.hash].slice(-TRAIL_MAX),
    hash: window.location.hash,
    sheet: id,
    data,
    sheets: [...sheetsOf(cur), id],
  };
  window.history.pushState({ ...stateObject(), rjb: e }, '', window.location.href);
  entry = e;
}
/** The sheet whose entry is the current one, or null. */
export const currentSheet = (): string | null => entry?.sheet ?? null;
/** The sheets open on the current page (their entries are this one and those just under it). */
export const openSheets = (): string[] => sheetsOf(entry);
/** What the current sheet entry holds to reopen as it was. */
export const currentSheetData = (): unknown => entry?.data;
/** Update what an open sheet's entry holds (its pick changed). */
export function setSheetData(id: string, data: unknown): void {
  if (entry?.sheet === id) writeEntry({ ...entry, data });
}
/** Start this tab's history record afresh on the current entry (tests start clean). */
export function resetHistoryRecord(): void {
  pendingBack = 0;
  afterPops = [];
  awaitingHash = false;
  clearTimeout(popTimer);
  knownHash = window.location.hash;
  writeEntry({ key: newKey(), trail: [], hash: window.location.hash });
}

/** A sheet closed on screen: pop its entry, so Back doesn't land on it, and the entries of any
 *  sheet still over it (closed with it). With a pop in flight (a menu item went Back, a sheet over
 *  this one closed first), it waits for that to land and pops what is left of it then. */
export function popSheet(id: string): void {
  if (pendingBack > 0) {
    afterPops.push(() => popSheet(id));
    return;
  }
  const open = sheetsOf(entry);
  const at = open.lastIndexOf(id);
  if (at < 0) return;
  const n = open.length - at;
  startPop(() => (n === 1 ? window.history.back() : window.history.go(-n)));
}

/** Run `fn` once the pops in flight have landed (now, when there are none): a sheet that opens as
 *  another closes (Sign in from the Account menu) pushes its entry after the menu's is popped. */
export function afterBack(fn: () => void): void {
  if (pendingBack > 0) afterPops.push(fn);
  else fn();
}

/** Read the current route, re-rendering on any hash change. */
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Non-hook getter for callers outside React. */
export function getRoute(): Route {
  return getSnapshot();
}

/** The hash of a saved job's Apply view (#/apply/<jobId>), for links. */
export function jobHash(jobId: string, section?: string): string {
  return buildHash({ tab: JOB_TAB, sub: null, pillar: null, jobId, section });
}

/** Open a saved job's Apply view, or (null) go back to the Apply list. `replace` moves in place
 *  (a pick in the list, the pager, the next job after Mark applied / Not a fit), keeping where the
 *  view was opened from, so one Back leaves it. There is no Apply mode of its own any more (#471:
 *  the tab is the mode). */
export function openJob(jobId: string | null, replace = false): void {
  const cur = getSnapshot();
  const within = replace && cur.tab === JOB_TAB && !!cur.jobId && !!jobId;
  navigate(
    { tab: JOB_TAB, sub: null, jobId, ...(within ? { from: cur.from ?? null } : {}) },
    replace,
  );
}

/** The posting `#/find/<fingerprint>` selects on Find (#471 slice 3), or null. */
export function postingOf(r: Route): string | null {
  if (r.tab !== FIND_TAB || !r.sub) return null;
  try {
    return decodeURIComponent(r.sub);
  } catch {
    return r.sub;
  }
}

/** The hash that selects a posting on Find, for links. */
export function findHash(fingerprint: string): string {
  return buildHash({
    tab: FIND_TAB,
    sub: encodeURIComponent(fingerprint),
    pillar: null,
    jobId: null,
  });
}

/** Select a posting on Find (null: none, back to the list). `replace` moves in place (a pick
 *  beside the list, the pager, the next posting after a decision), keeping where Find was opened
 *  from. */
export function selectPosting(fingerprint: string | null, replace = false): void {
  const cur = getSnapshot();
  navigate(
    {
      tab: FIND_TAB,
      sub: fingerprint === null ? null : encodeURIComponent(fingerprint),
      jobId: null,
      ...(replace && cur.tab === FIND_TAB ? { from: cur.from ?? null } : {}),
    },
    replace,
  );
}

/** The Company slug (still escaped) a route opens in the Apply tab, or null. */
export function companySlugOf(r: Route): string | null {
  return r.tab === JOB_TAB && !r.jobId && r.sub?.startsWith(`${COMPANY_SEG}/`)
    ? r.sub.slice(COMPANY_SEG.length + 1)
    : null;
}

/** The hash of a Company's page, for links (its slug is URL-safe, but escaped all the same). */
export function companyHash(slug: string): string {
  return buildHash({
    tab: JOB_TAB,
    sub: `${COMPANY_SEG}/${encodeURIComponent(slug)}`,
    pillar: null,
    jobId: null,
  });
}

/** Open a Company's page (#/apply/company/<slug>), in the Apply tab's right column at lg. */
export function openCompany(slug: string): void {
  navigate({ tab: JOB_TAB, sub: `${COMPANY_SEG}/${encodeURIComponent(slug)}`, jobId: null });
}

// ---- Return paths (Adrian 2026-10-22) ------------------------------------------------------------
// "Whenever someone navigates away with a key action, they should be able to get back." A page
// opened by a jump carries its origin in the route (`from`), so its Back names that page and goes
// there, and finishing the key action returns there; browser back/forward and reload keep it.

const PIPELINE_HASH = `#/${APPLY_TAB}`;

/** The full route for a partial one (missing fields null). */
const full = (r: Partial<Route> & { tab: string }): Route => ({
  sub: null,
  pillar: null,
  jobId: null,
  ...r,
});

/** Which page a route shows, ignoring its origin, section and pillar: two routes with the same
 *  key are the same page (history entries are matched on it). */
export function pageKey(r: Route): string {
  return `${r.tab}/${(r.tab === JOB_TAB ? (r.jobId ?? r.sub) : r.sub) ?? ''}`;
}

/** Where a page's Back goes when nothing recorded an origin: a job and a Company go to the Apply
 *  list, a selected posting to Find. Null for the top-level lists, which have no Back. */
export function defaultBack(r: Route): string | null {
  if (r.tab === JOB_TAB) return r.jobId || r.sub ? PIPELINE_HASH : null;
  if (r.tab === FIND_TAB) return r.sub ? `#/${FIND_TAB}` : null;
  return null;
}

// ---- Dialogs over a page (#471 slice 4) -----------------------------------------------------------
// Documents and Legal are dialogs, not pages: their state is in the page's query (`?documents=`,
// `?legal=`), so a link opens one over whatever page it names and a reload keeps it. Opening one
// pushes an entry, so the browser's Back closes it; a step inside it (the library to a document)
// pushes too, so Back goes back a step; closing it pops to the page as it was.

/** The hash of `page` with the Documents dialog open on `sub` ('' the library). */
export function documentsHash(sub: string, page: Route = getSnapshot()): string {
  return buildHash({ ...page, documents: sub, legal: null });
}

/** Open the Documents dialog over the page, or move inside it (`replace`: in place). */
export function openDocuments(sub = '', replace = false): void {
  navigate({ documents: sub, legal: null }, replace);
}

/** Open the Legal dialog over the page on `privacy` or `terms`, or swap between them in place. */
export function openLegal(doc: string, replace = false): void {
  navigate({ legal: doc, documents: null }, replace);
}

/** A step back inside a dialog (a document to the library): a pop when that step is just behind,
 *  else in place, so Back never walks into a step it already left. */
export function dialogStepBack(to: Route): void {
  if (pendingBack > 0) {
    afterPops.push(() => dialogStepBack(to));
    return;
  }
  const h = buildHash(to);
  const trail = entry?.trail ?? [];
  // Open sheets' entries (a menu item asked for this) repeat this hash: look past them.
  for (let i = trail.length - 1; i >= 0; i--) {
    if (trail[i] === window.location.hash) continue;
    if (trail[i] === h) {
      const delta = i - trail.length;
      startPop(() => window.history.go(delta));
      return;
    }
    break;
  }
  const open = sheetsOf(entry).length;
  if (open) {
    startPop(() => window.history.go(-open));
    afterPops.push(() => {
      if (h !== window.location.hash) replaceRoute(h);
    });
    return;
  }
  if (h !== window.location.hash) replaceRoute(h);
}

const hasDialog = (r: Route) => (r.documents !== null && r.documents !== undefined) || !!r.legal;

/** Close the open dialog: back to the entry of this page without it when that is just behind (so
 *  Back never reopens it), else the same page without it, in place. */
export function closeDialog(): void {
  if (pendingBack > 0) {
    afterPops.push(closeDialog);
    return;
  }
  const cur = getSnapshot();
  if (!hasDialog(cur)) return;
  const key = pageKey(cur);
  const trail = entry?.trail ?? [];
  for (let i = trail.length - 1; i >= 0; i--) {
    const t = parseHash(trail[i]);
    if (pageKey(t) !== key) break;
    if (!hasDialog(t)) {
      const delta = i - trail.length;
      startPop(() => window.history.go(delta));
      return;
    }
  }
  navigate({ documents: null, legal: null }, true);
}

/** The route a page was opened from, or null when none was recorded. An origin saved before a
 *  route moved (`/queue/<id>`, `/today`) reads as its new route. */
export function originOf(r: Route): Route | null {
  if (!r.from) return null;
  const o = parseHash('#' + r.from);
  return redirectOf(o) ?? o;
}

/** A route as an origin: its own origin kept one level deep (so two Backs work and the URL stays
 *  bounded), its pillar dropped. */
function asOrigin(r: Route): Route {
  const up = originOf(r);
  const { pillar: _pillar, ...rest } = r;
  const from = up ? buildHash({ ...up, from: null }).slice(1) : null;
  return { ...rest, pillar: null, from };
}

/** `dest` opened from `origin`: the origin is recorded in `from` unless it is the destination's
 *  default way back. Going on to the page the origin itself came from reuses that page's own
 *  origin instead of nesting (a job → its Company → the same job is not a loop). */
export function withOrigin(dest: Partial<Route> & { tab: string }, origin: Route): Route {
  const d = full({ ...dest, from: null });
  // No route yet (the app's first paint): nothing to name.
  if (!origin.tab || isAuthCallback(origin)) return d;
  const up = originOf(origin);
  if (pageKey(origin) === pageKey(d)) return { ...d, from: origin.from ?? null };
  if (up && pageKey(up) === pageKey(d)) return { ...d, from: up.from ?? null };
  const o = asOrigin(origin);
  const hash = buildHash(o);
  return { ...d, from: hash === defaultBack(d) ? null : hash.slice(1) };
}

/** A link's href for `dest` opened from `origin` (see withOrigin). */
export function linkTo(dest: Partial<Route> & { tab: string }, origin: Route): string {
  return buildHash(withOrigin(dest, origin));
}
