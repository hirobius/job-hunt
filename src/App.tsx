import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Box,
  CircularProgress,
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
import { STATUSES } from './types';

// Code-split the non-default views so the initial bundle only carries the default
// Apprenticeships + Queue tabs; the rest load on demand (tab switch / case-study route).
const DiscoverView = lazy(() => import('./DiscoverView'));
const CopyDeckView = lazy(() => import('./CopyDeckView'));
const CaseStudyView = lazy(() => import('./CaseStudyView'));
const PillarsDialog = lazy(() => import('./PillarsDialog'));

function ViewFallback() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
      <CircularProgress size={28} />
    </Box>
  );
}

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

export default function App() {
  // Default to the Apprenticeships tab (0), but land on the Queue (1) when arriving via a
  // quick-add link so the just-added job is visible. Computed once at mount.
  const [tab, setTab] = useState(() => {
    const qp = new URLSearchParams(window.location.search);
    return qp.get('add') || qp.get('applied') || (qp.get('status') && qp.get('u')) ? 1 : 0;
  });
  const [pillarsOpen, setPillarsOpen] = useState(false);

  // Shareable portfolio case-study page: ?case=<slug> renders full-screen (no tab shell).
  const caseSlug = new URLSearchParams(window.location.search).get('case');

  // Quick-add via ?add / ?applied / ?status=<Status>&u=<url> (shortcut, bookmarklet, Gmail-scan links)
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
        window.location.pathname + (s ? '?' + s : '') + window.location.hash,
      );
      // The initial tab was already set to the Queue in useState when a quick-add param was
      // present, so no setState is needed here (avoids set-state-in-effect).
    }
  }, [caseSlug]);

  if (caseSlug)
    return (
      <Suspense fallback={<ViewFallback />}>
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
        onChange={(_, v) => setTab(v)}
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
        <Suspense fallback={<ViewFallback />}>
          <CopyDeckView />
        </Suspense>
      )}
      {tab === 3 && (
        <Suspense fallback={<ViewFallback />}>
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
