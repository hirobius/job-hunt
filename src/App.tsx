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
import {
  usePillars,
  useActivePillarId,
  setActivePillar,
  getActivePillarId,
} from './pillarStore';
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
  const activePillarId = useActivePillarId();
  const pillars = usePillars();
  const defaultPillarId = pillars[0]?.id;
  const [pillarsOpen, setPillarsOpen] = useState(false);

  // Keep the active career pillar in sync with the URL both ways. URL → store: restore a
  // pillar named in the hash (invalid ids are ignored by setActivePillar and self-heal below).
  useEffect(() => {
    if (route.pillar && route.pillar !== getActivePillarId()) setActivePillar(route.pillar);
  }, [route.pillar]);

  // Store → URL: reflect the active pillar in the hash, but only when it isn't the default,
  // so common URLs stay clean (#/discover, not #/discover?pillar=<default>). Replace, since a
  // pillar switch is a filter, not a new navigation step.
  useEffect(() => {
    const wanted = defaultPillarId && activePillarId !== defaultPillarId ? activePillarId : null;
    if ((getRoute().pillar ?? null) !== wanted) navigate({ pillar: wanted }, true);
  }, [activePillarId, defaultPillarId]);

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
        <Tab label="Apprenticeships" />
        <Tab label="Queue" />
        <Tab label="Copy Deck" />
        <Tab label="Discover" />
      </Tabs>

      {tab === 0 && <ApprenticeshipsView />}
      {tab === 1 && <TrackerView />}
      {tab === 2 && (
        <Suspense fallback={<CopyDeckSkeleton />}>
          <CopyDeckView />
        </Suspense>
      )}
      {tab === 3 && (
        <Suspense fallback={<DiscoverSkeleton />}>
          <DiscoverView />
        </Suspense>
      )}

      {pillarsOpen && (
        <Suspense fallback={null}>
          <PillarsDialog open onClose={() => setPillarsOpen(false)} />
        </Suspense>
      )}
    </Container>
  );
}
