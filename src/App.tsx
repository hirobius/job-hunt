import { lazy, Suspense, useEffect, useState } from 'react';
import { useRoute, navigate, getRoute } from './route';
import { Box, Container, Stack, Tooltip, Typography } from '@mui/material';
import { Sun, Moon, MoreVertical, SlidersHorizontal, MessageSquareText } from 'lucide-react';
import {
  IconButton as HdsIconButton,
  Menu as HdsMenu,
  Tabs as HdsTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@hirobius/design-system';
import TrackerView from './TrackerView';
import ApprenticeshipsView from './ApprenticeshipsView';
import CloudSync from './CloudSync';
import { useColorMode } from './ColorMode';
import { addJob, markAppliedByUrl, setStatusByUrl } from './store';
import { useSyncPillarRoute } from './pillarRoute';
import { STATUSES } from './types';
import { DiscoverSkeleton, CopyDeckSkeleton, CaseStudySkeleton } from './Skeletons';

// Code-split the non-default views so the initial bundle only carries the default
// Apprenticeships + Queue tabs; the rest load on demand (tab switch / case-study route).
const DiscoverView = lazy(() => import('./DiscoverView'));
const CopyDeckView = lazy(() => import('./CopyDeckView'));
const CaseStudyView = lazy(() => import('./CaseStudyView'));
const PillarsDialog = lazy(() => import('./PillarsDialog'));

function ColorModeToggle() {
  const { mode, toggle } = useColorMode();
  const label = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <Tooltip title={label}>
      <HdsIconButton
        variant="tertiary"
        icon={mode === 'dark' ? Sun : Moon}
        onClick={toggle}
        label={label}
      />
    </Tooltip>
  );
}

// Secondary actions (manage trades + feedback) collapse into one overflow menu so the
// header stays a title + two controls at any width — the old row crammed a wide combobox
// plus four icon buttons onto one line and broke on phones.
function OverflowMenu({ onManage }: { onManage: () => void }) {
  return (
    <HdsMenu>
      <HdsMenu.Trigger asChild>
        <HdsIconButton variant="tertiary" icon={MoreVertical} label="More options" />
      </HdsMenu.Trigger>
      <HdsMenu.Content align="end">
        <HdsMenu.Item onSelect={onManage}>
          <SlidersHorizontal size={15} style={{ marginRight: 8 }} />
          Manage trades…
        </HdsMenu.Item>
        <HdsMenu.Item
          onSelect={() =>
            window.open('https://github.com/hirobius/job-hunt/issues/new', '_blank', 'noopener')
          }
        >
          <MessageSquareText size={15} style={{ marginRight: 8 }} />
          Send feedback
        </HdsMenu.Item>
      </HdsMenu.Content>
    </HdsMenu>
  );
}

// Top-level tabs, in render order. The URL hash carries the slug (#/queue …); the index
// is derived from it. Queue is the default landing view when the hash has no route.
const TAB_SLUGS = ['apprenticeships', 'queue', 'copy-deck', 'discover'] as const;
const DEFAULT_TAB = 'queue';
const defaultTabIndex = TAB_SLUGS.indexOf(DEFAULT_TAB);

export default function App() {
  const route = useRoute();
  const slugIndex = TAB_SLUGS.indexOf(route.tab as (typeof TAB_SLUGS)[number]);
  const tab = slugIndex >= 0 ? slugIndex : defaultTabIndex;
  const [pillarsOpen, setPillarsOpen] = useState(false);

  // The URL ↔ active-pillar binding lives behind one seam (src/pillarRoute.ts).
  useSyncPillarRoute();

  // Shareable portfolio case-study page: ?case=<slug> renders full-screen (no tab shell).
  const caseSlug = new URLSearchParams(window.location.search).get('case');

  // Quick-add via ?add / ?applied / ?status=<Status>&u=<url> (shortcut, bookmarklet, Gmail-scan links).
  // After ingesting, land on the Queue so the just-added job is visible; with no route at all,
  // normalize the hash to the default landing tab so back/forward and refresh are consistent.
  useEffect(() => {
    if (caseSlug) return; // skip ingestion on the case-study page
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
        window.location.pathname + (s ? '?' + s : '') + '#/' + DEFAULT_TAB,
      );
    } else if (!getRoute().tab) {
      navigate({ tab: DEFAULT_TAB }, true);
    }
  }, [caseSlug]);

  if (caseSlug)
    return (
      <Suspense fallback={<CaseStudySkeleton />}>
        <CaseStudyView slug={caseSlug} />
      </Suspense>
    );

  return (
    <Container maxWidth="md" sx={{ py: { xs: 2, sm: 4 }, px: { xs: 1.75, sm: 3 } }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: { xs: 1.5, sm: 2 } }}
      >
        <Typography variant="h1" sx={{ fontSize: { xs: '1.6rem', sm: '2.125rem' }, minWidth: 0 }}>
          Apply{' '}
          <Box component="span" sx={{ color: 'primary.main' }}>
            Board
          </Box>
        </Typography>
        <Stack direction="row" alignItems="center" spacing={0.25} sx={{ flex: 'none' }}>
          <ColorModeToggle />
          <OverflowMenu onManage={() => setPillarsOpen(true)} />
        </Stack>
      </Stack>

      <CloudSync />

      {/* HDS underline tabs (Radix): value = route slug, aria wiring comes from Radix. The list
          scrolls horizontally on narrow screens; the sx bump gives each tab a readable, tappable
          target (the default underline tabs read too faint/small on phones). */}
      <Box
        sx={{
          mb: { xs: 2, sm: 2.5 },
          '& [role="tab"]': {
            fontSize: { xs: '0.875rem', sm: '0.95rem' },
            fontWeight: 600,
            paddingTop: '10px',
            paddingBottom: '10px',
            paddingLeft: { xs: '7px', sm: '14px' },
            paddingRight: { xs: '7px', sm: '14px' },
          },
        }}
      >
        <HdsTabs
          value={TAB_SLUGS[tab]}
          onValueChange={(v) => navigate({ tab: v as (typeof TAB_SLUGS)[number], sub: null })}
        >
          <TabsList style={{ width: '100%' }}>
            <TabsTrigger value="apprenticeships">Trades</TabsTrigger>
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="copy-deck">Copy Deck</TabsTrigger>
            <TabsTrigger value="discover">Discover</TabsTrigger>
          </TabsList>
          <TabsContent value="apprenticeships">
            <ApprenticeshipsView />
          </TabsContent>
          <TabsContent value="queue">
            <TrackerView />
          </TabsContent>
          <TabsContent value="copy-deck">
            <Suspense fallback={<CopyDeckSkeleton />}>
              <CopyDeckView />
            </Suspense>
          </TabsContent>
          <TabsContent value="discover">
            <Suspense fallback={<DiscoverSkeleton />}>
              <DiscoverView />
            </Suspense>
          </TabsContent>
        </HdsTabs>
      </Box>

      {pillarsOpen && (
        <Suspense fallback={null}>
          <PillarsDialog open onClose={() => setPillarsOpen(false)} />
        </Suspense>
      )}
    </Container>
  );
}
