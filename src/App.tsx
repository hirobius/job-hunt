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
import TrackerView from './TrackerView';
import JobPage from './JobPage';
import { BRAND } from './brand';
import CloudSyncProvider from './account/CloudSyncProvider';
import DataToolsProvider from './account/DataToolsProvider';
import AccountMenu from './account/AccountMenu';
import SignInDialog from './account/SignInDialog';
import SyncNudge from './account/SyncNudge';
import { addJob, markAppliedByUrl, setStatusByUrl } from './store';
import { STATUSES } from './types';
import { DiscoverSkeleton, CopyDeckSkeleton } from './Skeletons';

// Code-split the non-default views so the initial bundle only carries the default Pipeline tab;
// the rest load on demand (tab switch).
const DiscoverView = lazy(() => import('./DiscoverView'));
const CopyDeckView = lazy(() => import('./CopyDeckView'));

// Top-level tabs, in render order (#115: Pipeline · Discover · Templates; Today joins in Phase 2
// and becomes the landing route then). The URL hash carries the slug (#/queue …); slugs stay
// back-compatible (`queue`/`copy-deck`) under the new labels, so old bookmarks keep working.
// HDS TabsContent is a tinted, padded card pulled up under its tab strip — right for in-page
// tabs, wrong for the app's top-level nav, where it indented every view 24px off the header's edge
// and nested each page in a surface. Top-level panels are bare (HDS gap, filed under #133).
const BARE_PANEL = {
  background: 'transparent',
  padding: 0,
  marginTop: 0,
  borderRadius: 0,
} as const;

const TAB_SLUGS = ['queue', 'discover', 'copy-deck'] as const;
// Where an empty hash lands, and where a quick-add link lands, are separate decisions (#127):
// Today becomes the home route in Phase 2b (#128); quick-add always shows the Pipeline, where the
// new job is.
const HOME_ROUTE = 'queue';
const QUICK_ADD_LANDING = 'queue';
const defaultTabIndex = TAB_SLUGS.indexOf(HOME_ROUTE);

export default function App() {
  const route = useRoute();
  const slugIndex = TAB_SLUGS.indexOf(route.tab as (typeof TAB_SLUGS)[number]);
  const tab = slugIndex >= 0 ? slugIndex : defaultTabIndex;

  // Quick-add via ?add / ?applied / ?status=<Status>&u=<url> (shortcut, bookmarklet, Gmail-scan links).
  // After ingesting, land on the Pipeline so the just-added job is visible; with no route at all,
  // normalize the hash to the default landing tab so back/forward and refresh are consistent.
  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    const label = qp.get('t') || qp.get('title') || '';
    let acted = false;
    if (qp.get('add')) {
      addJob(qp.get('add')!, label);
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
      <DataToolsProvider>
        <Container maxWidth="content">
          {/* Page gutter: the HDS region-gutter role (Container's own padding prop is retired). */}
          <Box sx={{ px: 'var(--semantic-space-region-gutter)', py: 'md' }}>
            <HdsTabs
              value={TAB_SLUGS[tab]}
              onValueChange={(v) =>
                navigate({ tab: v as (typeof TAB_SLUGS)[number], sub: null, jobId: null })
              }
            >
              <Stack gap="normal">
                {/* Slim header: name · top tabs · account. The tabs wrap under the name on mobile. */}
                <Stack direction="row" wrap="wrap" gap="gap" align="center" justify="space-between">
                  <Text variant="title" as="h1" style={{ margin: 0 }}>
                    {BRAND.wordmark[0]}
                    <Box as="span" sx={{ color: 'accent' }}>
                      {BRAND.wordmark[1]}
                    </Box>
                  </Text>
                  <AccountMenu />
                </Stack>
                <TabsList style={{ width: '100%', marginBottom: 0 }} aria-label="Sections">
                  <TabsTrigger value="queue">Pipeline</TabsTrigger>
                  <TabsTrigger value="discover">Discover</TabsTrigger>
                  <TabsTrigger value="copy-deck">Templates</TabsTrigger>
                </TabsList>
                <SyncNudge />
                <TabsContent value="queue" style={BARE_PANEL}>
                  {route.jobId ? <JobPage jobId={route.jobId} /> : <TrackerView />}
                </TabsContent>
                <TabsContent value="discover" style={BARE_PANEL}>
                  <Suspense fallback={<DiscoverSkeleton />}>
                    <DiscoverView />
                  </Suspense>
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
      </DataToolsProvider>
    </CloudSyncProvider>
  );
}
