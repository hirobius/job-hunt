import { lazy, Suspense, useEffect, useRef } from 'react';
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
import { FollowUpHost } from './FollowUp';
import { ApplyMode, CompanyPage, JobPage, TrackerView } from './routeViews';
import { JobPageLiveness } from './LivenessViews';
import { Onboarding, ChooseTrack } from './Onboarding';
import { usePageTitle } from './pageTitle';
import { BrandLogo } from './components/brand/BrandFlame';
import { LEGAL_ROUTE } from './legal';
import CloudSyncProvider from './account/CloudSyncProvider';
import DataToolsProvider from './account/DataToolsProvider';
import AccountMenu from './account/AccountMenu';
import SignInDialog from './account/SignInDialog';
import { markAppliedByUrl, setStatusByUrl, useJobs } from './store';
import { useSnippets } from './copyDeckStore';
import { migrateSnippetStore } from './outreachTemplates';
import { useCloudSync } from './account/accountContext';
import NoticeHost from './NoticeHost';
import StaleBuildNotice from './StaleBuildNotice';
import { authLinkErrorMessage } from './account/authLinkError';
import { QUICK_ADD_INVALID, saveWithNotice } from './saveNotice';
import { useCategories } from './curation/curationStore';
import { migrateSystemsOnly, SYSTEMS_ONLY_NOTICE } from './feed/systemsOnly';
import { STATUSES } from './types';
import { DiscoverSkeleton, CopyDeckSkeleton, PipelineSkeleton } from './Skeletons';
import { importFresh } from './staleBuild';
import V12Migration from './V12Migration';
import { PageShell } from './hds-gaps/PageShell';

// Code-split every route view: Discover, Documents and the rest here, the Pipeline, job page,
// Apply mode and Company page through routeViews.ts (they render without a Suspense step once
// loaded, so moving between them never flashes a skeleton).
const DiscoverView = lazy(importFresh(() => import('./DiscoverView')));
const DocumentsView = lazy(importFresh(() => import('./DocumentsView')));
const LegalPage = lazy(importFresh(() => import('./LegalPage')));
const NotFoundPage = lazy(importFresh(() => import('./NotFoundPage')));

// Top-level tabs, in render order (Calm list: Companies · Pipeline). The URL hash carries the slug;
// slugs stay back-compatible (`discover` is Companies, `queue` the Pipeline). `#/today` (#128) is
// retired (#236): it redirects to Companies. Templates lost its tab (#240) and became the
// Documents library (#227): `#/copy-deck` (slug kept) is a page with no tab selected, reached
// from the Apply sheet and the Menu.
const TAB_SLUGS = ['discover', 'queue'] as const;
const RETIRED_TODAY = 'today';
const DOCUMENTS_ROUTE = 'copy-deck';
// Where an empty hash lands, and where a quick-add link lands, are separate decisions (#127):
// Companies is home; quick-add always shows the Pipeline, where the new job is.
const HOME_ROUTE = 'discover';
const QUICK_ADD_LANDING = 'queue';
const APPLY_ROUTE = 'apply';
// The old Trades tab's slug: its bookmarks still land on Companies, like an empty hash.
const LEGACY_HOME = 'apprenticeships';
const defaultTabIndex = TAB_SLUGS.indexOf(HOME_ROUTE);

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
    if (settled && migrateSystemsOnly(categories) > 0)
      toast({ title: SYSTEMS_ONLY_NOTICE, tone: 'info', duration: 10000 });
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
  // Any other slug is a stale or mistyped link: say so (no tab selected) rather than show Companies.
  // A sign-in link's callback hash is not a link: Companies shows while auth-js reads it.
  const known: string[] = [...TAB_SLUGS, APPLY_ROUTE, COMPANY_TAB, DOCUMENTS_ROUTE, LEGAL_ROUTE];
  const notFound =
    route.tab !== '' &&
    route.tab !== RETIRED_TODAY &&
    route.tab !== LEGACY_HOME &&
    !isAuthCallback(route) &&
    !known.includes(route.tab);
  const noTab = documents || legal || notFound;
  const slugIndex = TAB_SLUGS.indexOf(
    (applying || company ? QUICK_ADD_LANDING : route.tab) as (typeof TAB_SLUGS)[number],
  );
  const tab = slugIndex >= 0 ? slugIndex : defaultTabIndex;
  // The section pages' titles; a job, Apply mode, a Company and the legal pages set their own.
  usePageTitle(
    notFound
      ? 'Page not found'
      : documents
        ? 'Documents'
        : applying || company || legal || route.jobId
          ? null
          : TAB_SLUGS[tab] === 'queue'
            ? 'Pipeline'
            : 'Companies',
  );

  // Top tabs (return paths): another tab reopens where it was left (openTab); the open tab, tapped
  // again, goes to its root, and at its root back to the top. Radix selects on mouse down, so
  // whether the tab was already open is read before that, on pointer or key down.
  const tappedOpen = useRef<TopTab | null>(null);
  const pressed = (slug: TopTab) => () => {
    tappedOpen.current = !noTab && TAB_SLUGS[tab] === slug ? slug : null;
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

  // The onboarding gate (#128) lives here, not in a view. Companies can't work without a track,
  // and on a first run (no tracks and no jobs) it also offers sample data, so nobody lands on an
  // empty home. The Pipeline and Documents never gate: quick-add and sample data work before setup.
  const hasTracks = useCategories().length > 0;
  const jobs = useJobs();
  const hasJobs = jobs.length > 0;
  const firstRun = !hasTracks && !hasJobs;

  // Quick-add via ?add / ?applied / ?status=<Status>&u=<url> (shortcut, bookmarklet, Gmail-scan links).
  // After ingesting, land on the Pipeline so the just-added job is visible; with no route at all,
  // normalize the hash to the default landing tab so back/forward and refresh are consistent.
  const { toast } = useToast();
  useEffect(() => {
    const linkError = authLinkErrorMessage(window.location.hash);
    const qp = new URLSearchParams(window.location.search);
    const label = qp.get('t') || qp.get('title') || '';
    const add = qp.get('add'),
      applied = qp.get('applied'),
      st = qp.get('status'),
      su = qp.get('u');
    const setsStatus = !!(st && su && (STATUSES as string[]).includes(st));
    if (add || applied || setsStatus) {
      ['add', 'applied', 'status', 'u', 't', 'title'].forEach((k) => qp.delete(k));
      const s = qp.toString();
      // Land first, then save: the save notice drops itself on any move away from the page it was
      // raised on, so raised before the landing it was gone at once. Through the route seam, so it
      // knows the hash it is on (a sheet's pop would wait otherwise).
      navigate(
        { tab: QUICK_ADD_LANDING, sub: null, pillar: null, jobId: null, from: null, section: null },
        true,
        { search: s ? '?' + s : '' },
      );
      if (add && saveWithNotice(add, label) === 'invalid')
        toast({ title: QUICK_ADD_INVALID, tone: 'warning', duration: 10000 });
      if (applied) markAppliedByUrl(applied, label);
      if (setsStatus) setStatusByUrl(su!, st as never, label);
    } else if (linkError) {
      // An expired or refused sign-in link (#error=…): say so, and replace the error with Companies.
      toast({ title: linkError, tone: 'warning', duration: 10000 });
      navigate(
        { tab: HOME_ROUTE, sub: null, pillar: null, jobId: null, from: null, section: null },
        true,
      );
    } else if (!getRoute().tab) {
      navigate({ tab: HOME_ROUTE }, true);
    }
    // Mount only: the link is read once, as the tab opens (a new `toast` must not re-run a quick-add).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // An old #/today link or bookmark (#236) lands on Companies; replace, so Back skips it.
  useEffect(() => {
    if (route.tab === RETIRED_TODAY) navigate({ tab: HOME_ROUTE, sub: null, jobId: null }, true);
  }, [route.tab]);

  return (
    <CloudSyncProvider>
      <SnippetMigration />
      <SystemsOnlyMigration />
      <V12Migration />
      <DataToolsProvider>
        {/* The portfolio's shell (Adrian 2026-10-22): 1048 in all (narrowed 2026-10-24), gutters that grow with the
            viewport, so content stops near 920. Header, tabs and every page share it. */}
        <PageShell>
          <Box sx={{ py: 'md' }}>
            {/* On the Documents, legal and not-found pages no tab is selected (and no tab panel mounts).
                Manual activation there: Tab past the Account button focuses the first tab, which
                would otherwise select it and leave the page before a keyboard user reaches it. */}
            <HdsTabs
              value={noTab ? '' : TAB_SLUGS[tab]}
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
                    {/* Slim app bar: the brand lockup (live flame + Sora wordmark, the page's one h1;
                      Adrian 2026-10-24) · the Account avatar. */}
                    <Stack direction="row" gap="gap" align="center" justify="space-between">
                      <BrandLogo fontSize={19} />
                      <AccountMenu />
                    </Stack>
                    <TabsList
                      style={{ marginBottom: 0 }}
                      className="rjb-top-tabs"
                      aria-label="Sections"
                    >
                      <TabsTrigger value="discover" {...trigger('discover')}>
                        Companies
                      </TabsTrigger>
                      <TabsTrigger value="queue" {...trigger('queue')}>
                        Pipeline
                      </TabsTrigger>
                    </TabsList>
                  </Stack>
                </Box>
                <Box as="main">
                  <Stack gap="px24">
                    <TabsContent value="queue" variant="bare" tabIndex={-1}>
                      <Suspense fallback={<PipelineSkeleton />}>
                        {applying ? (
                          <ApplyMode jobId={route.sub} />
                        ) : company ? (
                          <CompanyPage slug={route.sub ?? ''} />
                        ) : route.jobId ? (
                          <>
                            <JobPageLiveness jobId={route.jobId} />
                            <JobPage jobId={route.jobId} />
                          </>
                        ) : (
                          // No sync banner: the Account menu's sync line says where data lives.
                          <TrackerView />
                        )}
                      </Suspense>
                    </TabsContent>
                    <TabsContent value="discover" variant="bare" tabIndex={-1}>
                      {firstRun ? (
                        <Onboarding offerSample />
                      ) : hasTracks ? (
                        <Suspense fallback={<DiscoverSkeleton />}>
                          <DiscoverView />
                        </Suspense>
                      ) : (
                        <ChooseTrack />
                      )}
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
                </Box>
              </Stack>
            </HdsTabs>
          </Box>
        </PageShell>
        <SignInDialog />
        <FollowUpHost />
        <NoticeHost />
        <StaleBuildNotice />
      </DataToolsProvider>
    </CloudSyncProvider>
  );
}
