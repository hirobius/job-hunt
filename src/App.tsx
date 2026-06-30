import { lazy, Suspense, useEffect, useState } from 'react';
import { useRoute, navigate, getRoute } from './route';
import {
  Box,
  Container,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
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
const HdsReal = lazy(() => import('./hds/HdsReal')); // ?spike=hds — real @hirobius/design-system

function ColorModeToggle() {
  const { mode, toggle } = useColorMode();
  const label = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <Tooltip title={label}>
      <IconButton onClick={toggle} aria-label={label} sx={{ flex: 'none' }}>
        {mode === 'dark' ? (
          <LightModeOutlinedIcon fontSize="small" />
        ) : (
          <DarkModeOutlinedIcon fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  );
}

function PillarSwitcher() {
  const pillars = usePillars();
  const activeId = useActivePillarId();
  return (
    <Select
      size="small"
      value={activeId}
      onChange={(e) => setActivePillar(e.target.value)}
      aria-label="Career pillar"
      sx={{ '& .MuiSelect-select': { py: 0.5, fontSize: '0.85rem' } }}
    >
      {pillars.map((p) => (
        <MenuItem key={p.id} value={p.id}>
          {p.label}
        </MenuItem>
      ))}
    </Select>
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

  // Real HDS validation showcase (preview-only): ?spike=hds
  if (new URLSearchParams(window.location.search).get('spike') === 'hds')
    return (
      <Suspense fallback={null}>
        <HdsReal />
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
            <IconButton
              onClick={() => setPillarsOpen(true)}
              aria-label="Manage pillars"
              sx={{ flex: 'none' }}
            >
              <TuneOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <ColorModeToggle />
        </Stack>
      </Stack>

      <CloudSync />

      <Tabs
        value={tab}
        onChange={(_, v) => navigate({ tab: TAB_SLUGS[v], sub: null })}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab
          label="Apprenticeships"
          id="tab-apprenticeships"
          aria-controls="tabpanel-apprenticeships"
        />
        <Tab label="Queue" id="tab-queue" aria-controls="tabpanel-queue" />
        <Tab label="Copy Deck" id="tab-copy-deck" aria-controls="tabpanel-copy-deck" />
        <Tab label="Discover" id="tab-discover" aria-controls="tabpanel-discover" />
      </Tabs>

      {tab === 0 && (
        <Box role="tabpanel" id="tabpanel-apprenticeships" aria-labelledby="tab-apprenticeships">
          <ApprenticeshipsView />
        </Box>
      )}
      {tab === 1 && (
        <Box role="tabpanel" id="tabpanel-queue" aria-labelledby="tab-queue">
          <TrackerView />
        </Box>
      )}
      {tab === 2 && (
        <Box role="tabpanel" id="tabpanel-copy-deck" aria-labelledby="tab-copy-deck">
          <Suspense fallback={<CopyDeckSkeleton />}>
            <CopyDeckView />
          </Suspense>
        </Box>
      )}
      {tab === 3 && (
        <Box role="tabpanel" id="tabpanel-discover" aria-labelledby="tab-discover">
          <Suspense fallback={<DiscoverSkeleton />}>
            <DiscoverView />
          </Suspense>
        </Box>
      )}

      {pillarsOpen && (
        <Suspense fallback={null}>
          <PillarsDialog open onClose={() => setPillarsOpen(false)} />
        </Suspense>
      )}
    </Container>
  );
}
