import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  useRoute,
  navigate,
  getRoute,
  goBackTo,
  isAuthCallback,
  pageKey,
  parseHash,
  COMPANY_TAB,
} from './route';
import { openTab, type TopTab } from './tabMemory';
import {
  Tabs as HdsTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Box,
  Stack,
  useToast,
} from '@hirobius/design-system';
import { LazyAddInterviewHost, LazyFollowUpHost } from './lazyHosts';
import { ApplyMode, CompanyPage, JobPage, Today, TrackerView } from './routeViews';
import { JobPageLiveness } from './lazyDialogs';
import { usePageTitle } from './pageTitle';
import { useViewEnter } from './viewEnter';
import { BrandLogo } from './brand/Flame';
import { BootHold } from './brand/BootHold';
import { needsClientAtBoot } from './supabase';
import { LEGAL_ROUTE } from './legalRoute';
import CloudSyncProvider from './account/CloudSyncProvider';
import DataToolsProvider from './account/DataToolsProvider';
import AccountMenu from './account/AccountMenu';
import SignInHost from './account/SignInHost';
import { useJobs } from './store';
import { useProfile } from './profile';
import { useSnippets } from './copyDeckStore';
import { migrateSnippetStore } from './outreachTemplates';
import { scanOnOpenEnabled } from './feed/scanOnOpenFlag';
import { useCloudSync } from './account/accountContext';
import NoticeHost from './NoticeHost';
import StaleBuildNotice from './StaleBuildNotice';
import { AUTH_ERROR_PARAMS, authLinkErrorMessage } from './account/authLinkError';
import { clearOAuthRequest, readOAuthRequest } from './account/authLink';
import { QUICK_ADD_INVALID, quickAddBadStatus, saveWithNotice } from './saveNotice';
import { setStatusWithNotice } from './jobUndo';
import { useCategories } from './curation/curationStore';
import { STATUSES, type Status } from './types';
import { CopyDeckSkeleton, PipelineSkeleton } from './Skeletons';
import { importFresh } from './staleBuild';
import V12Migration from './V12Migration';
import { PageShell } from './hds-gaps/PageShell';
import { PageErrorBoundary } from './ErrorBoundary';

// Code-split every route view: Documents and the rest here, the Pipeline, job page,
// Apply mode and Company page through routeViews.ts (they render without a Suspense step once
// loaded, so moving between them never flashes a skeleton).
const DocumentsView = lazy(importFresh(() => import('./DocumentsView')));
const LegalPage = lazy(importFresh(() => import('./LegalPage')));
const NotFoundPage = lazy(importFresh(() => import('./NotFoundPage')));
const loadSystemsOnly = importFresh(() => import('./feed/systemsOnly'));
// The auto-scan's host (#415): its own chunk; a chunk that fails to load only skips this scan
// (importFresh still raises the new-version notice).
const AutoScanOnOpen = lazy(() =>
  importFresh(() => import('./feed/useAutoScan'))().then(
    (m) => ({ default: m.AutoScanOnOpen }),
    () => ({ default: () => null }),
  ),
);

// Top-level tabs, in render order: exactly two, Today · Jobs (simplify #383 + amendment 2, Q6).
// The URL hash carries the slug (`queue` is the Pipeline, its tab named Jobs). The Companies tab is
// gone with its screens (#389): route.ts sends `#/discover/*` (and the Trades slug) to Today, and
// Followed / Ignored companies sit under the Account menu. Templates lost its tab (#240) and became the
// Documents library (#227): `#/copy-deck` (slug kept) is a page with no tab selected, reached
// from the Apply sheet and the Menu.
const TAB_SLUGS = ['today', 'queue'] as const;
const DOCUMENTS_ROUTE = 'copy-deck';
// Where an empty hash lands, and where a quick-add link lands, are separate decisions (#127):
// Today is home; quick-add always shows the Pipeline, where the new job is.
const HOME_ROUTE = 'today';
const QUICK_ADD_LANDING = 'queue';
const APPLY_ROUTE = 'apply';
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
  const { settled } = useCloudSync();
  const snippets = useSnippets();
  useEffect(() => {
    if (settled) migrateSnippetStore();
  }, [settled, snippets]);
  return null;
}

/** The one-time move of a Design Systems track to systems-only (feed/systemsOnly.ts), after sync
 *  settles so a track moved on another device is left alone. Says so once, the time it moves one. */
function SystemsOnlyMigration() {
  const { settled } = useCloudSync();
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
  // Apply mode (#/apply/<jobId>) and a Company's page (#/company/<slug>, #230) are Pipeline
  // pages: the Pipeline tab stays selected.
  const applying = route.tab === APPLY_ROUTE;
  const company = route.tab === COMPANY_TAB;
  const documents = route.tab === DOCUMENTS_ROUTE;
  // The Privacy policy and Terms (#43): pages with no tab, like Documents.
  const legal = route.tab === LEGAL_ROUTE;
  // Any other slug is a stale or mistyped link: say so (no tab selected) rather than show home.
  // A sign-in link's callback hash is not a link: Today shows while auth-js reads it.
  const slugs: string[] = [...TAB_SLUGS];
  const known: string[] = [...slugs, APPLY_ROUTE, COMPANY_TAB, DOCUMENTS_ROUTE, LEGAL_ROUTE];
  const notFound = route.tab !== '' && !isAuthCallback(route) && !known.includes(route.tab);
  const noTab = documents || legal || notFound;
  const slugIndex = slugs.indexOf(applying || company ? QUICK_ADD_LANDING : route.tab);
  const tabSlug = slugIndex >= 0 ? slugs[slugIndex] : slugs[defaultTabIndex];
  // The section pages' titles; a job, Apply mode, a Company and the legal pages set their own.
  usePageTitle(
    notFound
      ? 'Page not found'
      : documents
        ? 'Documents'
        : applying || company || legal || route.jobId
          ? null
          : tabSlug === 'queue'
            ? 'Pipeline'
            : 'Today',
  );

  // Top tabs (return paths): another tab reopens where it was left (openTab); the open tab, tapped
  // again, goes to its root, and at its root back to the top. Radix selects on mouse down, so
  // whether the tab was already open is read before that, on pointer or key down.
  const viewRef = useRef<HTMLDivElement>(null);
  useViewEnter(viewRef, route.tab);

  const tappedOpen = useRef<TopTab | null>(null);
  const pressed = (slug: TopTab) => () => {
    tappedOpen.current = !noTab && tabSlug === slug ? slug : null;
  };
  const tapped = (slug: TopTab) => () => {
    if (tappedOpen.current !== slug) return;
    tappedOpen.current = null;
    if (pageKey(getRoute()) === `${slug}/`) window.scrollTo({ top: 0, behavior: 'smooth' });
    else goBackTo(parseHash(`#/${slug}`));
  };
  const trigger = (slug: TopTab) => ({
    onPointerDown: pressed(slug),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        pressed(slug)();
        tapped(slug)();
      }
    },
    onClick: tapped(slug),
  });

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
    const linkError = authLinkErrorMessage(
      window.location.hash,
      window.location.search,
      readOAuthRequest(),
    );
    if (linkError) clearOAuthRequest();
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
      <DataToolsProvider>
        {/* The portfolio's shell (Adrian 2026-10-22): 1048 in all (narrowed 2026-10-24), gutters that grow with the
            viewport, so content stops near 920. Header, tabs and every page share it. */}
        <PageShell>
          <Box sx={{ py: 'md' }}>
            {/* On the Documents, legal and not-found pages no tab is selected (and no tab panel mounts).
                Manual activation there: Tab past the Account button focuses the first tab, which
                would otherwise select it and leave the page before a keyboard user reaches it. */}
            <HdsTabs
              value={noTab ? '' : tabSlug}
              activationMode={noTab ? 'manual' : 'automatic'}
              onValueChange={(v) => openTab(v as TopTab)}
            >
              {/* The shell owns the page rhythm (rev-3 .wrap): 24 from the tabs to the first thing on
                  every page (its back link or its title); views add no top margin of their own. */}
              <Stack gap="px24">
                {/* Landmarks: the app bar is the banner, the page is the one main (axe
                    landmark-one-main / region). */}
                <Box as="header">
                  <Stack gap="normal">
                    {/* Slim app bar: the brand lockup (the flame from src/brand/flame.svg + the
                      wordmark, named for the product; the page's own name is its h1, #363) · the
                      Account avatar. */}
                    <Stack direction="row" gap="gap" align="center" justify="space-between">
                      <BrandLogo fontSize={19} />
                      <AccountMenu />
                    </Stack>
                    <TabsList className="rjb-top-tabs" aria-label="Sections">
                      <TabsTrigger value="today" {...trigger('today')}>
                        Today
                      </TabsTrigger>
                      <TabsTrigger value="queue" {...trigger('queue')}>
                        Jobs
                      </TabsTrigger>
                    </TabsList>
                  </Stack>
                </Box>
                <Box as="main">
                  {/* A page whose chunk is gone after a deploy says so here, not over the shell
                      (#331); a move to another page clears it. */}
                  <PageErrorBoundary resetKey={pageKey(route)}>
                    {/* Not keyed: remounting on pageKey drops focus and pager state on in-place
                        hops. useViewEnter replays the motion on a page-kind change instead. */}
                    <Stack gap="px24" ref={viewRef} className="rjb-view-enter">
                      <TabsContent value="today" variant="bare" tabIndex={-1}>
                        <Suspense fallback={<PipelineSkeleton />}>
                          <PageHold firstRun={firstRun}>
                            <Today />
                          </PageHold>
                        </Suspense>
                      </TabsContent>
                      <TabsContent value="queue" variant="bare" tabIndex={-1}>
                        <Suspense fallback={<PipelineSkeleton />}>
                          {applying ? (
                            <ApplyMode jobId={route.sub} />
                          ) : company ? (
                            <CompanyPage slug={route.sub ?? ''} />
                          ) : route.jobId ? (
                            <>
                              <Suspense fallback={null}>
                                <JobPageLiveness jobId={route.jobId} />
                              </Suspense>
                              <JobPage jobId={route.jobId} />
                            </>
                          ) : (
                            // No sync banner: the Account menu's sync line says where data lives.
                            <TrackerView />
                          )}
                        </Suspense>
                      </TabsContent>
                      {documents && (
                        <Suspense fallback={<CopyDeckSkeleton />}>
                          <DocumentsView />
                        </Suspense>
                      )}
                      {legal && (
                        <Suspense fallback={null}>
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
            </HdsTabs>
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
