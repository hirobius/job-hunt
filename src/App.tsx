import { PageBarSlot } from './pageBarSlot';
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useRoute,
  navigate,
  getRoute,
  goBackTo,
  isAuthCallback,
  pageKey,
  parseHash,
  APPLY_TAB,
  FIND_TAB,
  companySlugOf,
  postingOf,
} from './route';
import { openTab, type TopTab } from './tabMemory';
import { Box, Stack, useToast } from '@hirobius/design-system';
import { LazyAddInterviewHost, LazyFollowUpHost } from './lazyHosts';
import { CompanyPage, JobPage, Today, TrackerView } from './routeViews';
import { DocumentsView, LegalPage } from './lazyDialogs';
import { usePageTitle } from './pageTitle';
import { useViewEnter } from './viewEnter';
import { BrandLogo } from './brand/Flame';
import { BRAND } from './brand';
import { BootHold } from './brand/BootHold';
import { needsClientAtBoot } from './supabase';
import CloudSyncProvider from './account/CloudSyncProvider';
import DataToolsProvider from './account/DataToolsProvider';
import AccountMenu from './account/AccountMenu';
import SignInHost from './account/SignInHost';
import { useJobs } from './store';
import { useProfile } from './profile';
import { useSnippets } from './copyDeckStore';
import { migrateSnippetStore } from './outreachTemplates';
import { scanOnOpenEnabled } from './feed/scanOnOpenFlag';
import { canWrite, useCloudSync } from './account/accountContext';
import NoticeHost from './NoticeHost';
import StaleBuildNotice from './StaleBuildNotice';
import { AUTH_ERROR_PARAMS, authLinkErrorMessage } from './account/authLinkError';
import { QUICK_ADD_INVALID, quickAddBadStatus, saveWithNotice } from './saveNotice';
import { setStatusWithNotice } from './jobUndo';
import { useCategories } from './curation/curationStore';
import { STATUSES, type Status } from './types';
import { PipelineSkeleton } from './Skeletons';
import { importFresh } from './staleBuild';
import V12Migration from './V12Migration';
import { PageShell } from './hds-gaps/PageShell';
import { PageErrorBoundary } from './ErrorBoundary';
import DialogHold from './DialogHold';

// Code-split every route view: Documents and the rest here, the Apply list, the job view and
// the Company page through routeViews.ts (they render without a Suspense step once
// loaded, so moving between them never flashes a skeleton).
const NotFoundPage = lazy(importFresh(() => import('./NotFoundPage')));
// The count beside each top tab (#548): its own chunk (pipelineView is not in the entry).
// The app bar's theme switch and its burn (#688): its own chunk.
const ThemeBurnToggle = lazy(importFresh(() => import('./burn/ThemeBurnToggle')));
const loadSystemsOnly = importFresh(() => import('./feed/systemsOnly'));
// The auto-scan's host (#415): its own chunk; a chunk that fails to load only skips this scan
// (importFresh still raises the new-version notice).
const AutoScanOnOpen = lazy(() =>
  importFresh(() => import('./feed/useAutoScan'))().then(
    (m) => ({ default: m.AutoScanOnOpen }),
    () => ({ default: () => null }),
  ),
);
// The liveness check on open (#602): its own chunk too, mounted like the auto-scan.
const LivenessOnOpen = lazy(() =>
  importFresh(() => import('./LivenessViews'))().then(
    (m) => ({ default: m.LivenessOnOpen }),
    () => ({ default: () => null }),
  ),
);

// Top-level tabs, in render order: exactly two, Find · Apply (#471; were Today · Jobs, slugs
// `today` · `queue`, which route.ts redirects). The Companies tab is
// gone with its screens (#389): route.ts sends `#/discover/*` (and the Trades slug) to Find, and
// Followed / Ignored companies sit under the Account menu. Templates lost its tab (#240) and became the
// Documents library (#227): `#/copy-deck` (slug kept) is a page with no tab selected, reached
// from the Apply sheet and the Menu.
const TAB_SLUGS = [FIND_TAB, APPLY_TAB] as const;
// Where an empty hash lands, and where a quick-add link lands, are separate decisions (#127):
// Find is home; quick-add always shows the Apply list, where the new job is.
const HOME_ROUTE = FIND_TAB;
const QUICK_ADD_LANDING = APPLY_TAB;
// The quick-add link's params (shortcut, bookmarklet, Gmail-scan links): read once, then removed.
const QUICK_ADD_PARAMS = ['add', 'applied', 'status', 'u', 't', 'title'];
const defaultTabIndex = TAB_SLUGS.indexOf(HOME_ROUTE);

/** On Today, a signed-in device with nothing on it shows the flame until its cloud copy lands,
 *  instead of flashing an empty Today (brand/BootHold.tsx). Decided once, at boot; offline
 *  there is nothing to wait for. Pages that never gate (Jobs, Documents, legal) are never held. */
function PageHold({ firstRun, children }: { firstRun: boolean; children: ReactNode }) {
  const { settled, offline } = useCloudSync();
  const [waiting] = useState(() => firstRun && needsClientAtBoot());
  return (
    <BootHold waiting={waiting} settled={settled || offline}>
      {children}
    </BootHold>
  );
}

/** Moves the legacy snippets into the Documents library as Outreach messages (#227), once each,
 *  after sync has settled so the cloud's copy (already moved on another device) is here first. */
function SnippetMigration() {
  const settled = canWrite(useCloudSync());
  const snippets = useSnippets();
  useEffect(() => {
    if (settled) migrateSnippetStore();
  }, [settled, snippets]);
  return null;
}

/** The one-time move of a Design Systems track to systems-only (feed/systemsOnly.ts), after sync
 *  settles so a track moved on another device is left alone. Says so once, the time it moves one. */
function SystemsOnlyMigration() {
  const settled = canWrite(useCloudSync());
  const categories = useCategories();
  const { toast } = useToast();
  useEffect(() => {
    if (!settled) return;
    let live = true;
    // Loaded on demand: the starter packs it reads are off the first paint (#371).
    void loadSystemsOnly().then(
      ({ migrateSystemsOnly, SYSTEMS_ONLY_NOTICE }) => {
        if (live && migrateSystemsOnly(categories) > 0)
          toast({ title: SYSTEMS_ONLY_NOTICE, tone: 'info', duration: 10000 });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [settled, categories, toast]);
  return null;
}

export default function App() {
  const route = useRoute();
  // A Company's page (#/apply/company/<slug>, #230, #471) is in the Apply tab.
  const companySlug = companySlugOf(route);
  const company = companySlug !== null;
  // Documents and the Privacy policy and Terms are dialogs over the page (#471 slice 4).
  const documents = route.documents !== null && route.documents !== undefined;
  const legal = !!route.legal;
  // Any other slug is a stale or mistyped link: say so (no tab selected) rather than show home.
  // A sign-in link's callback hash is not a link: Today shows while auth-js reads it.
  const slugs: string[] = [...TAB_SLUGS];
  const known = slugs.includes(route.tab);
  const notFound = route.tab !== '' && !isAuthCallback(route) && !known;
  const tabSlug = known ? route.tab : slugs[defaultTabIndex];
  // The section pages' titles; a job, a Company and the legal pages set their own.
  usePageTitle(
    notFound
      ? 'Page not found'
      : documents || legal || company || route.jobId || postingOf(route)
        ? null
        : tabSlug === APPLY_TAB
          ? 'Apply'
          : 'Find',
  );

  // Top tabs (return paths): another tab reopens where it was left (openTab); the open tab, tapped
  // again, goes to its root, and at its root back to the top. They are links in a nav (the open one
  // aria-current="page"), not ARIA tabs: each opens a page, there is no tab panel (top tabs PR).
  const viewRef = useRef<HTMLDivElement>(null);
  useViewEnter(viewRef, route.tab);

  const current = (slug: TopTab) => !notFound && tabSlug === slug;
  // A plain click is the app's; a modified one (new tab or window) keeps the browser's own way.
  const plainClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    e.preventDefault();
    return true;
  };
  // The open tab's root: at the root, back to the top; else back to it (a pop when it is an earlier
  // entry of this tab, so Back never bounces).
  const toRoot = (slug: TopTab) => {
    if (pageKey(getRoute()) === `${slug}/`) window.scrollTo({ top: 0, behavior: 'smooth' });
    else goBackTo(parseHash(`#/${slug}`));
  };
  const tabLink = (slug: TopTab) => ({
    href: `#/${slug}`,
    className: 'rjb-seg',
    'aria-current': current(slug) ? ('page' as const) : undefined,
    onClick: (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!plainClick(e)) return;
      if (!current(slug)) openTab(slug);
      else toRoot(slug);
    },
  });
  // The logo is the home link (#620): it opens Find at its root, from anywhere (a tab tap reopens
  // where the tab was left; the logo never does).
  const toFind = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!plainClick(e)) return;
    if (current(FIND_TAB)) toRoot(FIND_TAB);
    else navigate(parseHash(`#/${FIND_TAB}`));
  };

  // Find / Apply look like an HDS SegmentedControl (Adrian 2026-11-09), in the app bar's one row at
  // every width (#548: the phone's second row went). HDS SegmentedControl is a radio group (Radix
  // toggle group; arrow keys select), so it cannot be a nav: these stay links in a nav, the open one
  // aria-current="page", drawn with its tokens (base.css .rjb-segs). Upstream ask:
  // docs/hds-upstream-asks/segmented-nav.md (G7, hds#1438). No counts on the tabs (Find controls, 2026-11-13).
  const [barSlot, setBarSlot] = useState<HTMLDivElement | null>(null);
  const sections = (
    <Box as="nav" aria-label="Sections" className="rjb-segs">
      <a {...tabLink(FIND_TAB)}>
        Find
      </a>
      <a {...tabLink(APPLY_TAB)}>
        Apply
      </a>
    </Box>
  );

  // No setup screen (Adrian 2026-10-29): a first run (no Search profile, no jobs, no old tracks)
  // gets the design-systems profile on its own once sync settles (V12Migration → ensureProfile)
  // and opens on Today with the scan running. `firstRun` only holds Today for a signed-in device
  // whose cloud copy is on its way. Sample data is offered from the Jobs page's empty state.
  const hasTracks = useCategories().length > 0;
  const hasProfile = !!useProfile();
  const jobs = useJobs();
  const hasJobs = jobs.length > 0;
  const firstRun = !hasProfile && !hasTracks && !hasJobs;

  // Quick-add via ?add / ?applied / ?status=<Status>&u=<url> (shortcut, bookmarklet, Gmail-scan links).
  // After ingesting, land on the Pipeline so the just-added job is visible; with no route at all,
  // normalize the hash to the default landing tab so back/forward and refresh are consistent.
  const { toast } = useToast();
  useEffect(() => {
    const linkError = authLinkErrorMessage(window.location.hash, window.location.search);
    const qp = new URLSearchParams(window.location.search);
    const label = qp.get('t') || qp.get('title') || '';
    const add = qp.get('add'),
      applied = qp.get('applied'),
      st = qp.get('status'),
      su = qp.get('u');
    const knownStatus = !!st && (STATUSES as string[]).includes(st);
    const setsStatus = knownStatus && !!su;
    const warn = (title: string) => toast({ title, tone: 'warning', duration: 10000 });
    if (QUICK_ADD_PARAMS.some((k) => qp.has(k))) {
      const asks = { add: qp.has('add'), applied: qp.has('applied'), status: qp.has('status') };
      // Every quick-add param leaves the URL, whether the link was usable or not (#333).
      QUICK_ADD_PARAMS.forEach((k) => qp.delete(k));
      const s = qp.toString();
      const acts = !!(add || applied || setsStatus);
      // Land first, then save: the save notice drops itself on any move away from the page it was
      // raised on, so raised before the landing it was gone at once. Through the route seam, so it
      // knows the hash it is on (a sheet's pop would wait otherwise). A link that does nothing
      // stays on the page it named.
      navigate(
        acts
          ? {
              tab: QUICK_ADD_LANDING,
              sub: null,
              pillar: null,
              jobId: null,
              from: null,
              section: null,
            }
          : getRoute().tab
            ? {}
            : { tab: HOME_ROUTE },
        true,
        { search: s ? '?' + s : '' },
      );
      // A link that did something says so in its own notice; one that did nothing says why, once.
      let did = false;
      if (add) did = saveWithNotice(add, label) !== 'invalid' || did;
      if (applied) did = setStatusWithNotice(applied, 'Applied', label) || did;
      if (setsStatus) did = setStatusWithNotice(su!, st as Status, label) || did;
      if (!did && (asks.add || asks.applied || asks.status))
        warn(st && !knownStatus ? quickAddBadStatus(st) : QUICK_ADD_INVALID);
    } else if (linkError) {
      // An expired or refused sign-in link, or a cancelled Google sign-in (error=… in the hash or
      // the query): say so, and replace the error with home (the query's error params go too).
      toast({ title: linkError, tone: 'warning', duration: 10000 });
      AUTH_ERROR_PARAMS.forEach((k) => qp.delete(k));
      const s = qp.toString();
      navigate(
        { tab: HOME_ROUTE, sub: null, pillar: null, jobId: null, from: null, section: null },
        true,
        { search: s ? '?' + s : '' },
      );
    } else if (!getRoute().tab) {
      navigate({ tab: HOME_ROUTE }, true);
    }
    // Mount only: the link is read once, as the tab opens (a new `toast` must not re-run a quick-add).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <CloudSyncProvider>
      <SnippetMigration />
      <SystemsOnlyMigration />
      <V12Migration />
      {/* The scan starts once the profile is here (made on its own on a first run). */}
      {scanOnOpenEnabled() && hasProfile && (
        <Suspense fallback={null}>
          <AutoScanOnOpen />
        </Suspense>
      )}
      {scanOnOpenEnabled() && (
        <Suspense fallback={null}>
          <LivenessOnOpen />
        </Suspense>
      )}
      <DataToolsProvider>
        {/* The portfolio's shell (Adrian 2026-10-22): 1048 in all (narrowed 2026-10-24), gutters that grow with the
            viewport, so content stops near 920. Header, tabs and every page share it. */}
        <PageShell>
          {/* 32 over the app bar, 24 under the page: the flame's embers rise ~21px over the logo,
              and with 24 they ran off the top of a phone screen (retro quick wins, 2026-11-08). */}
          <Box sx={{ pt: 'lg', pb: 'md' }}>
            {/* The shell owns the page rhythm (rev-3 .wrap): 24 from the tabs to the first thing on
                  every page (its back link or its title); views add no top margin of their own. */}
            <Stack gap="px24">
              {/* Landmarks: the app bar is the banner, the page is the one main (axe
                    landmark-one-main / region). */}
              <Box as="header">
                {/* Slim app bar, one row at every width (#548): the brand lockup (the flame from
                    src/brand/flame.svg + the wordmark, named for the product; the page's own name is
                    its h1, #363), a link home to Find (#620) · Find / Apply · the Account avatar. */}
                {/* It wraps only where the row cannot fit (a 320px screen): the tabs go under the logo. */}
                <Stack direction="row" gap="px4" align="center" justify="space-between" wrap="wrap">
                  <a
                    href={`#/${FIND_TAB}`}
                    className="rjb-logo-link"
                    aria-label={`${BRAND.name}, Find`}
                    onClick={toFind}
                  >
                    <BrandLogo fontSize={19} />
                  </a>
                  <Stack direction="row" gap="px4" align="center">
                    <Suspense
                      fallback={<span className="rjb-theme-toggle-hold" aria-hidden="true" />}
                    >
                      <ThemeBurnToggle />
                    </Suspense>
                    <AccountMenu />
                  </Stack>
                </Stack>
              </Box>
              <Box as="main" className="rjb-main">
                {/* The page bar: Find / Apply at top left, where the page's title was (each page's
                    h1 is .sr-only now); Find puts its caption and More in the slot at the right. */}
                <Box className="rjb-page-bar">
                  {sections}
                  <Box className="rjb-page-bar-tools" ref={setBarSlot} />
                </Box>
                {/* A page whose chunk is gone after a deploy says so here, not over the shell
                      (#331); a move to another page clears it. */}
                <PageErrorBoundary resetKey={pageKey(route)}>
                  {/* Not keyed: remounting on pageKey drops focus and pager state on in-place
                        hops. useViewEnter replays the motion on a page-kind change instead. */}
                  <Stack gap="px24" ref={viewRef} className="rjb-view-enter">
                    {current(FIND_TAB) && (
                      <Suspense fallback={<PipelineSkeleton />}>
                        <PageHold firstRun={firstRun}>
                          <PageBarSlot.Provider value={barSlot}>
                            <Today />
                          </PageBarSlot.Provider>
                        </PageHold>
                      </Suspense>
                    )}
                    {current(APPLY_TAB) && (
                      <Suspense fallback={<PipelineSkeleton />}>
                        {company ? (
                          <CompanyPage slug={companySlug} />
                        ) : route.jobId ? (
                          <JobPage jobId={route.jobId} />
                        ) : (
                          // No sync banner: the Account menu's sync line says where data lives.
                          <TrackerView />
                        )}
                      </Suspense>
                    )}
                    {documents && (
                      <Suspense fallback={<DialogHold title="Documents" size="xl" />}>
                        <DocumentsView />
                      </Suspense>
                    )}
                    {legal && (
                      <Suspense fallback={<DialogHold title="Privacy and terms" size="lg" />}>
                        <LegalPage />
                      </Suspense>
                    )}
                    {notFound && (
                      <Suspense fallback={null}>
                        <NotFoundPage />
                      </Suspense>
                    )}
                  </Stack>
                </PageErrorBoundary>
              </Box>
            </Stack>
          </Box>
        </PageShell>
        <SignInHost />
        <LazyFollowUpHost />
        <LazyAddInterviewHost />
        <NoticeHost />
        <StaleBuildNotice />
      </DataToolsProvider>
    </CloudSyncProvider>
  );
}
