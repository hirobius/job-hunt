import { lazy, Suspense, useEffect } from 'react';
import { useRoute, navigate, getRoute, COMPANY_TAB } from './route';
import {
  Tabs as HdsTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Box,
  Text,
  Container,
  Stack,
  useAtLeast,
} from '@hirobius/design-system';
import { FollowUpHost } from './FollowUp';
import TrackerView from './TrackerView';
import JobPage from './JobPage';
import ApplyMode from './ApplyMode';
import CompanyPage from './CompanyPage';
import { JobPageLiveness } from './LivenessViews';
import { Onboarding, ChooseTrack } from './Onboarding';
import { BRAND } from './brand';
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
import { saveWithNotice } from './saveNotice';
import { useCategories } from './curation/curationStore';
import { STATUSES } from './types';
import { DiscoverSkeleton, CopyDeckSkeleton } from './Skeletons';

// Code-split Discover and Documents so the initial bundle carries the Pipeline (the quick-add
// landing); the rest load on demand.
const DiscoverView = lazy(() => import('./DiscoverView'));
const DocumentsView = lazy(() => import('./DocumentsView'));
const LegalPage = lazy(() => import('./LegalPage'));
const NotFoundPage = lazy(() => import('./NotFoundPage'));

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
// The page gutter (roomy): 20 on a phone (scale sm), HDS's region gutter (40) from sm up.
const GUTTER = { base: 'sm', sm: 'var(--semantic-space-region-gutter)' };

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
  const known: string[] = [...TAB_SLUGS, APPLY_ROUTE, COMPANY_TAB, DOCUMENTS_ROUTE, LEGAL_ROUTE];
  const notFound =
    route.tab !== '' &&
    route.tab !== RETIRED_TODAY &&
    route.tab !== LEGACY_HOME &&
    !known.includes(route.tab);
  const noTab = documents || legal || notFound;
  // The job page's list rail needs the wide column (lg and up); every other page is the 760 measure.
  const atLg = useAtLeast('lg');
  const wideJob = !!route.jobId && !applying && !company && atLg;
  const slugIndex = TAB_SLUGS.indexOf(
    (applying || company ? QUICK_ADD_LANDING : route.tab) as (typeof TAB_SLUGS)[number],
  );
  const tab = slugIndex >= 0 ? slugIndex : defaultTabIndex;

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
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const label = qp.get('t') || qp.get('title') || '';
    let acted = false;
    if (qp.get('add')) {
      saveWithNotice(qp.get('add')!, label);
      acted = true;
    }
    if (qp.get('applied')) {
      markAppliedByUrl(qp.get('applied')!, label);
      acted = true;
    }
    const st = qp.get('status'),
      su = qp.get('u');
    if (st && su && (STATUSES as string[]).includes(st)) {
      setStatusByUrl(su, st as never, label);
      acted = true;
    }
    if (acted) {
      ['add', 'applied', 'status', 'u', 't', 'title'].forEach((k) => qp.delete(k));
      const s = qp.toString();
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (s ? '?' + s : '') + '#/' + QUICK_ADD_LANDING,
      );
    } else if (!getRoute().tab) {
      navigate({ tab: HOME_ROUTE }, true);
    }
  }, []);

  // An old #/today link or bookmark (#236) lands on Companies; replace, so Back skips it.
  useEffect(() => {
    if (route.tab === RETIRED_TODAY) navigate({ tab: HOME_ROUTE, sub: null, jobId: null }, true);
  }, [route.tab]);

  return (
    <CloudSyncProvider>
      <SnippetMigration />
      <DataToolsProvider>
        {/* No tab is selected on the Documents, legal and not-found pages (and no tab panel mounts).
            Manual activation there: Tab past the Account button focuses the first tab, which
            would otherwise select it and leave the page before a keyboard user reaches it. */}
        <HdsTabs
          value={noTab ? '' : TAB_SLUGS[tab]}
          activationMode={noTab ? 'manual' : 'automatic'}
          onValueChange={(v) =>
            navigate({ tab: v as (typeof TAB_SLUGS)[number], sub: null, jobId: null })
          }
        >
          {/* The app bar runs full width between the gutters (roomy, 2026-10-22): the wordmark on
              the titleSm step (so a page title is always the biggest text) and the Account avatar,
              12 over the tab row, whose rule is the header's one line. Same on every route. */}
          <Box as="header" sx={{ px: GUTTER, pt: { base: 'fixed-sm', sm: 'fixed-md' } }}>
            <Stack gap="medium">
              <Stack direction="row" gap="gap" align="center" justify="space-between">
                <Text variant="titleSm" as="h1">
                  {BRAND.name}
                </Text>
                <AccountMenu />
              </Stack>
              <TabsList style={{ marginBottom: 0 }} className="rjb-top-tabs" aria-label="Sections">
                <TabsTrigger value="discover">Companies</TabsTrigger>
                <TabsTrigger value="queue">Pipeline</TabsTrigger>
              </TabsList>
            </Stack>
          </Box>
          {/* The page: open margins and one measure (roomy). The shell owns the space under the
              tabs (40 on a phone, 64 from md) and under the page (64); views add none of their
              own. Every page is the 760 content column, centred; the job page widens to the HDS
              max (1200) at lg, where its list rail sits beside it. */}
          <Box as="main" sx={{ px: GUTTER, pt: { base: 'lg', md: 'xl' }, pb: 'xl' }}>
            <Container maxWidth={wideJob ? 'max' : 'content'}>
              <TabsContent value="queue" variant="bare">
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
                  // Unsynced shows as the Account avatar's dot (rev-3 P): no banner here.
                  <TrackerView />
                )}
              </TabsContent>
              <TabsContent value="discover" variant="bare">
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
            </Container>
          </Box>
        </HdsTabs>
        <SignInDialog />
        <FollowUpHost />
        <NoticeHost />
      </DataToolsProvider>
    </CloudSyncProvider>
  );
}
