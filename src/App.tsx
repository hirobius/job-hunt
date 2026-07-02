import { lazy, Suspense, useEffect, useState } from 'react';
import { useRoute, navigate, getRoute } from './route';
import { Box, Container, Stack, Tooltip, Typography } from '@mui/material';
import { Sun, Moon, SlidersHorizontal, MessageSquareText } from 'lucide-react';
import {
  Combobox,
  IconButton as HdsIconButton,
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
import { usePillars, useActivePillarId, setActivePillar } from './pillarStore';
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

function PillarSwitcher() {
  const pillars = usePillars();
  const activeId = useActivePillarId();
  return (
    <Combobox
      aria-label="Career pillar"
      options={pillars.map((p) => ({ value: p.id, label: p.label }))}
      value={activeId}
      onChange={setActivePillar}
      placeholder="Pillar"
    />
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
    <Container maxWidth="md" sx={{ py: { xs: 2.5, sm: 4 } }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h1">
          Apply{' '}
          <Box component="span" sx={{ color: 'primary.main' }}>
            Board
          </Box>
        </Typography>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 'none' }}>
          <PillarSwitcher />
          <Tooltip title="Manage pillars">
            <HdsIconButton
              variant="tertiary"
              icon={SlidersHorizontal}
              onClick={() => setPillarsOpen(true)}
              label="Manage pillars"
            />
          </Tooltip>
          <Tooltip title="Send feedback / report a bug">
            <HdsIconButton
              variant="tertiary"
              icon={MessageSquareText}
              onClick={() =>
                window.open('https://github.com/hirobius/job-hunt/issues/new', '_blank', 'noopener')
              }
              label="Send feedback (opens GitHub)"
            />
          </Tooltip>
          <ColorModeToggle />
        </Stack>
      </Stack>

      <CloudSync />

      {/* HDS underline tabs (Radix): value = route slug, aria wiring comes from Radix.
          forceMount is NOT used — inactive panels unmount, matching the old behavior. */}
      <HdsTabs
        value={TAB_SLUGS[tab]}
        onValueChange={(v) => navigate({ tab: v as (typeof TAB_SLUGS)[number], sub: null })}
      >
        <TabsList style={{ marginBottom: 20, width: '100%' }}>
          <TabsTrigger value="apprenticeships">Apprenticeships</TabsTrigger>
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

      {pillarsOpen && (
        <Suspense fallback={null}>
          <PillarsDialog open onClose={() => setPillarsOpen(false)} />
        </Suspense>
      )}
    </Container>
  );
}
