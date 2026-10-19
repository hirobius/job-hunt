import { lazy, Suspense, useEffect } from 'react';
import { useRoute, navigate, getRoute } from './route';
import {
  Tabs as HdsTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Box,
  Text,
  Container,
  Stack,
} from '@hirobius/design-system';
import TodayView from './TodayView';
import { FollowUpHost } from './FollowUp';
import TrackerView from './TrackerView';
import JobPage from './JobPage';
import ApplyMode from './ApplyMode';
import { JobPageLiveness, PipelineLiveness } from './LivenessViews';
import { Onboarding, ChooseTrack } from './Onboarding';
import { markTodayNoticeSeen } from './todayNoticeSeen';
import { useCloudSync } from './account/accountContext';
import { hasCloudSession } from './demo/loadSample';
import { BRAND } from './brand';
import CloudSyncProvider from './account/CloudSyncProvider';
import DataToolsProvider from './account/DataToolsProvider';
import AccountMenu from './account/AccountMenu';
import SignInDialog from './account/SignInDialog';
import SyncNudge from './account/SyncNudge';
import { addJob, findJobByUrl, markAppliedByUrl, setStatusByUrl, useJobs } from './store';
import NoticeHost from './NoticeHost';
import { notifySaved } from './saveNotice';
import { useCategories } from './curation/curationStore';
import { STATUSES } from './types';
import { DiscoverSkeleton, CopyDeckSkeleton } from './Skeletons';
import TabsOverflowFade from './hds-gaps/TabsOverflowFade';
import { BARE_PANEL } from './hds-gaps/barePanel';

// Code-split Discover and Templates so the initial bundle carries Today and the Pipeline (home and
// the quick-add landing); the rest load on demand (tab switch).
const DiscoverView = lazy(() => import('./DiscoverView'));
const CopyDeckView = lazy(() => import('./CopyDeckView'));

// Top-level tabs, in render order (Calm list, PR #208: Companies · Pipeline · Templates). The URL
// hash carries the slug; slugs stay back-compatible (`discover` is Companies, `queue` the Pipeline,
// `copy-deck` Templates). `today` is a legacy route: no tab, still renders until its slice removes it.
const TAB_SLUGS = ['discover', 'queue', 'copy-deck', 'today'] as const;
// Where an empty hash lands, and where a quick-add link lands, are separate decisions (#127):
// Companies is home; quick-add always shows the Pipeline, where the new job is.
const HOME_ROUTE = 'discover';
const QUICK_ADD_LANDING = 'queue';
const APPLY_ROUTE = 'apply';
const defaultTabIndex = TAB_SLUGS.indexOf(HOME_ROUTE);

export default function App() {
  const route = useRoute();
  // Apply mode (#/apply/<jobId>) is a Pipeline page: the Pipeline tab stays selected.
  const applying = route.tab === APPLY_ROUTE;
  const slugIndex = TAB_SLUGS.indexOf(
    (applying ? QUICK_ADD_LANDING : route.tab) as (typeof TAB_SLUGS)[number],
  );
  const tab = slugIndex >= 0 ? slugIndex : defaultTabIndex;

  // The onboarding gate (#128) lives here, not in a view. Discover can't work without a track;
  // Today asks for one only on a first run (no tracks and no jobs), so nobody lands on an empty
  // home. The Pipeline and Templates never gate: quick-add and sample data work before setup.
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
      if (addJob(qp.get('add')!, label)) {
        const job = findJobByUrl(qp.get('add')!);
        if (job) notifySaved([job.url], job.label);
      }
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

  return (
    <CloudSyncProvider>
      <MarkFirstRun firstRun={firstRun} />
      <DataToolsProvider>
        {/* The HDS page width (1200): wide enough for the Pipeline table and, next, the job page's
            list rail (#129, #130). Each view sets its own inner measure where prose needs one. */}
        <Container maxWidth="max">
          {/* Page gutter: the HDS region-gutter role (Container's own padding prop is retired). */}
          <Box sx={{ px: 'var(--semantic-space-region-gutter)', py: 'md' }}>
            <HdsTabs
              value={TAB_SLUGS[tab]}
              onValueChange={(v) =>
                navigate({ tab: v as (typeof TAB_SLUGS)[number], sub: null, jobId: null })
              }
            >
              <Stack gap="normal">
                {/* Slim app bar: wordmark · Menu. The wordmark is a body-size label so each page's
                    title stays the biggest text on screen. */}
                <Stack direction="row" wrap="wrap" gap="gap" align="center" justify="space-between">
                  <Text variant="body" as="h1" className="rjb-semibold">
                    {BRAND.wordmark[0]}
                    <Box as="span" sx={{ color: 'accent' }}>
                      {BRAND.wordmark[1]}
                    </Box>
                  </Text>
                  <AccountMenu />
                </Stack>
                {/* The fade says more sit past the edge when the tabs overflow a narrow phone. */}
                <TabsOverflowFade value={TAB_SLUGS[tab]}>
                  <TabsList style={{ width: '100%', marginBottom: 0 }} aria-label="Sections">
                    <TabsTrigger value="discover">Companies</TabsTrigger>
                    <TabsTrigger value="queue">Pipeline</TabsTrigger>
                    <TabsTrigger value="copy-deck">Templates</TabsTrigger>
                  </TabsList>
                </TabsOverflowFade>
                {TAB_SLUGS[tab] === 'today' && !firstRun && <SyncNudge />}
                <TabsContent value="today" style={BARE_PANEL}>
                  {firstRun ? <Onboarding offerSample /> : <TodayView />}
                </TabsContent>
                <TabsContent value="queue" style={BARE_PANEL}>
                  {applying ? (
                    <ApplyMode jobId={route.sub} />
                  ) : route.jobId ? (
                    <>
                      <JobPageLiveness jobId={route.jobId} />
                      <JobPage jobId={route.jobId} />
                    </>
                  ) : (
                    <>
                      <PipelineLiveness jobs={jobs} />
                      <TrackerView />
                    </>
                  )}
                </TabsContent>
                <TabsContent value="discover" style={BARE_PANEL}>
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
                <TabsContent value="copy-deck" style={BARE_PANEL}>
                  <Suspense fallback={<CopyDeckSkeleton />}>
                    <CopyDeckView />
                  </Suspense>
                </TabsContent>
              </Stack>
            </HdsTabs>
          </Box>
        </Container>
        <SignInDialog />
        <FollowUpHost />
        <NoticeHost />
      </DataToolsProvider>
    </CloudSyncProvider>
  );
}

// A first run marks the one-time "Today is home" notice seen: it never had a Tracker to miss. Only
// once sync has settled, since a signed-in account's jobs and tracks may still be on their way down.
// A stored session counts as signed in before its user loads (the session check can answer first).
function MarkFirstRun({ firstRun }: { firstRun: boolean }) {
  const { settled, user } = useCloudSync();
  const signedOut = !user && !hasCloudSession();
  useEffect(() => {
    if (firstRun && settled && (user || signedOut)) markTodayNoticeSeen();
  }, [firstRun, settled, user, signedOut]);
  return null;
}
