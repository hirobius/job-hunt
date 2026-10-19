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
import { FollowUpHost } from './FollowUp';
import TrackerView from './TrackerView';
import JobPage from './JobPage';
import ApplyMode from './ApplyMode';
import { JobPageLiveness, PipelineLiveness } from './LivenessViews';
import { Onboarding, ChooseTrack } from './Onboarding';
import { BRAND } from './brand';
import CloudSyncProvider from './account/CloudSyncProvider';
import DataToolsProvider from './account/DataToolsProvider';
import AccountMenu from './account/AccountMenu';
import SignInDialog from './account/SignInDialog';
import SyncNudge from './account/SyncNudge';
import { markAppliedByUrl, setStatusByUrl, useJobs } from './store';
import NoticeHost from './NoticeHost';
import { saveWithNotice } from './saveNotice';
import { useCategories } from './curation/curationStore';
import { STATUSES } from './types';
import { DiscoverSkeleton, CopyDeckSkeleton } from './Skeletons';
import TabsOverflowFade from './hds-gaps/TabsOverflowFade';
import { BARE_PANEL } from './hds-gaps/barePanel';
import { useAtLeast } from './hds-gaps/useBreakpoint';

// Code-split Discover and Templates so the initial bundle carries the Pipeline (the quick-add
// landing); the rest load on demand.
const DiscoverView = lazy(() => import('./DiscoverView'));
const CopyDeckView = lazy(() => import('./CopyDeckView'));

// Top-level tabs, in render order (Calm list: Companies · Pipeline). The URL hash carries the slug;
// slugs stay back-compatible (`discover` is Companies, `queue` the Pipeline). `#/today` (#128) is
// retired (#236): it redirects to Companies. Templates lost its tab (#240): `#/copy-deck` is a
// page with no tab selected, reached from the Apply sheet and the Menu.
const TAB_SLUGS = ['discover', 'queue'] as const;
const RETIRED_TODAY = 'today';
const TEMPLATES_ROUTE = 'copy-deck';
// Where an empty hash lands, and where a quick-add link lands, are separate decisions (#127):
// Companies is home; quick-add always shows the Pipeline, where the new job is.
const HOME_ROUTE = 'discover';
const QUICK_ADD_LANDING = 'queue';
const APPLY_ROUTE = 'apply';
const defaultTabIndex = TAB_SLUGS.indexOf(HOME_ROUTE);

export default function App() {
  const route = useRoute();
  const wide = useAtLeast('sm');
  // Apply mode (#/apply/<jobId>) is a Pipeline page: the Pipeline tab stays selected.
  const applying = route.tab === APPLY_ROUTE;
  const templates = route.tab === TEMPLATES_ROUTE;
  const slugIndex = TAB_SLUGS.indexOf(
    (applying ? QUICK_ADD_LANDING : route.tab) as (typeof TAB_SLUGS)[number],
  );
  const tab = slugIndex >= 0 ? slugIndex : defaultTabIndex;

  // The onboarding gate (#128) lives here, not in a view. Companies can't work without a track,
  // and on a first run (no tracks and no jobs) it also offers sample data, so nobody lands on an
  // empty home. The Pipeline and Templates never gate: quick-add and sample data work before setup.
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
      <DataToolsProvider>
        {/* The HDS page width (1200): wide enough for the Pipeline table and, next, the job page's
            list rail (#129, #130). Each view sets its own inner measure where prose needs one. */}
        <Container maxWidth="max">
          {/* Page gutter: the HDS region-gutter role (Container's own padding prop is retired). */}
          <Box sx={{ px: 'var(--semantic-space-region-gutter)', py: 'md' }}>
            {/* On the Templates page no tab is selected (and no tab panel mounts). */}
            <HdsTabs
              value={templates ? '' : TAB_SLUGS[tab]}
              onValueChange={(v) =>
                navigate({ tab: v as (typeof TAB_SLUGS)[number], sub: null, jobId: null })
              }
            >
              <Stack gap="normal">
                {/* Slim app bar (#241): mark · Menu. The app name never competes with a page
                    title: a small mark on a phone, a body-size (16px) wordmark from `sm` up. */}
                <Stack direction="row" wrap="wrap" gap="gap" align="center" justify="space-between">
                  <Text variant="body" as="h1" className="rjb-semibold">
                    {wide ? (
                      <>
                        {BRAND.wordmark[0]}
                        <Box as="span" sx={{ color: 'accent' }}>
                          {BRAND.wordmark[1]}
                        </Box>
                      </>
                    ) : (
                      <Box as="span" role="img" aria-label={BRAND.name} className="rjb-mark">
                        {BRAND.name[0]}
                      </Box>
                    )}
                  </Text>
                  <AccountMenu />
                </Stack>
                {/* The fade says more sit past the edge when the tabs overflow a narrow phone. */}
                <TabsOverflowFade value={TAB_SLUGS[tab]}>
                  <TabsList style={{ width: '100%', marginBottom: 0 }} aria-label="Sections">
                    <TabsTrigger value="discover">Companies</TabsTrigger>
                    <TabsTrigger value="queue">Pipeline</TabsTrigger>
                  </TabsList>
                </TabsOverflowFade>
                <TabsContent value="queue" style={BARE_PANEL}>
                  {applying ? (
                    <ApplyMode jobId={route.sub} />
                  ) : route.jobId ? (
                    <>
                      <JobPageLiveness jobId={route.jobId} />
                      <JobPage jobId={route.jobId} />
                    </>
                  ) : (
                    // 24 between the notes and the page (#241); an absent note leaves no gap.
                    <Stack gap="normal">
                      {/* The one sync nudge (#236: was on Today) sits over the Pipeline list. */}
                      <SyncNudge />
                      <PipelineLiveness jobs={jobs} />
                      <TrackerView />
                    </Stack>
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
                {templates && (
                  <Suspense fallback={<CopyDeckSkeleton />}>
                    <CopyDeckView />
                  </Suspense>
                )}
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
