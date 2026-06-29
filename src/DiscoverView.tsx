import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Link,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import TileGrid from './TileGrid';
import { useRoute, navigate } from './route';
import { BOARDS, ATS, entryLevelize, type Tile } from './jobsData';
import { useActivePillar } from './pillarStore';
import { CROSS_CUTTING_GROUPS, type Pillar, type Seniority } from './pillars';

function TitlesPanel({ titles, applyEntry }: { titles: string[]; applyEntry: boolean }) {
  const [title, setTitle] = useState(titles[0] ?? '');
  if (titles.length === 0)
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        No titles in this pillar yet — add some in Manage pillars.
      </Typography>
    );
  const term = `"${title}"`;
  const tiles: Tile[] = BOARDS.map((b) => ({
    name: b.name,
    meta: b.tag,
    url: applyEntry ? entryLevelize(b.build(term)) : b.build(term),
  }));
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Pick a title — searches fire {applyEntry ? 'entry-level filtered ' : ''}across every board.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
        {titles.map((tt) => (
          <Chip
            key={tt}
            label={tt}
            onClick={() => setTitle(tt)}
            color={tt === title ? 'primary' : 'default'}
            variant={tt === title ? 'filled' : 'outlined'}
            size="small"
          />
        ))}
      </Box>
      <TileGrid tiles={tiles} cta="Search" />
    </Box>
  );
}

function AtsPanel({
  roles,
  seniority,
  defaultLoc,
}: {
  roles: string[];
  seniority: Seniority;
  defaultLoc: 'remote' | 'spokane' | 'both';
}) {
  const [role, setRole] = useState(roles[0] ?? '');
  const [loc, setLoc] = useState<'remote' | 'spokane' | 'both'>(defaultLoc);
  const [recency, setRecency] = useState<'' | 'w' | 'm'>('');
  if (roles.length === 0)
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        No ATS roles in this pillar yet — add some in Manage pillars.
      </Typography>
    );
  const locClause =
    loc === 'spokane'
      ? '("Spokane" OR Washington)'
      : loc === 'both'
        ? '(remote OR "Spokane")'
        : 'remote';
  const levelClause = seniority === 'entry' ? ' (entry OR junior OR associate)' : '';
  const gUrl = (site: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(`${site} "${role}"${levelClause} ${locClause}`)}${recency ? '&tbs=qdr:' + recency : ''}`;
  const tiles: Tile[] = ATS.map((a) => ({ name: a.name, meta: a.domain, url: gUrl(a.site) }));
  const allUrl = gUrl('(' + ATS.map((a) => a.site).join(' OR ') + ')');
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
        Search companies' hiring systems straight through Google — far less competition.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <TextField
          size="small"
          label="Role / title"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          sx={{ minWidth: 180 }}
        />
        <ToggleButtonGroup size="small" exclusive value={loc} onChange={(_, v) => v && setLoc(v)}>
          <ToggleButton value="remote">Remote</ToggleButton>
          <ToggleButton value="spokane">Spokane</ToggleButton>
          <ToggleButton value="both">Both</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={recency}
          onChange={(_, v) => setRecency(v ?? '')}
        >
          <ToggleButton value="">Any time</ToggleButton>
          <ToggleButton value="w">Past week</ToggleButton>
          <ToggleButton value="m">Past month</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 0.5 }}>
        {roles.map((r) => (
          <Chip key={r} label={r} size="small" onClick={() => setRole(r)} variant="outlined" />
        ))}
      </Box>
      <Button
        variant="contained"
        sx={{ my: 1.5 }}
        component={Link}
        href={allUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        Search all platforms
      </Button>
      <TileGrid tiles={tiles} cta="Search" />
    </Box>
  );
}

type TabDesc = { key: string; label: string; kind: 'group' | 'titles' | 'ats'; tiles?: Tile[] };

export default function DiscoverView() {
  const pillar = useActivePillar();
  // Key by pillar id: switching pillars remounts the body, resetting the active tab
  // (tab counts differ per pillar) without a setState-in-effect.
  return <DiscoverBody key={pillar.id} pillar={pillar} />;
}

function DiscoverBody({ pillar }: { pillar: Pillar }) {
  const featured = pillar.groups[0];
  const fieldRest = pillar.groups.slice(1);
  const tabs: TabDesc[] = [
    ...(featured
      ? [{ key: featured.id, label: 'Apply Now', kind: 'group' as const, tiles: featured.tiles }]
      : []),
    { key: 'titles', label: 'Title search', kind: 'titles' },
    { key: 'ats', label: 'ATS search', kind: 'ats' },
    ...fieldRest.map((g) => ({
      key: g.id,
      label: g.label,
      kind: 'group' as const,
      tiles: g.tiles,
    })),
    ...CROSS_CUTTING_GROUPS.map((g) => ({
      key: g.id,
      label: g.label,
      kind: 'group' as const,
      tiles: g.tiles,
    })),
  ];
  // The active sub-tab lives in the URL hash (#/discover/<key>) so it survives refresh and
  // back/forward. Match by stable key, not index — tab counts differ per pillar. Index 0
  // (the featured/first tab) maps to a bare #/discover for clean URLs.
  const route = useRoute();
  const subIndex = route.sub ? tabs.findIndex((tb) => tb.key === route.sub) : -1;
  const tab = subIndex >= 0 ? subIndex : 0;
  const cur = tabs[tab] ?? tabs[0];
  const defaultLoc = pillar.location.toLowerCase().includes('spokane') ? 'spokane' : 'remote';

  return (
    <Box>
      <Tabs
        value={tab}
        onChange={(_, v) => navigate({ sub: v === 0 ? null : tabs[v].key })}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 2, minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0.5 } }}
      >
        {tabs.map((tb) => (
          <Tab
            key={tb.key}
            label={tb.label}
            id={`disc-tab-${tb.key}`}
            aria-controls={`disc-tabpanel-${tb.key}`}
          />
        ))}
      </Tabs>
      <Box
        role="tabpanel"
        id={`disc-tabpanel-${cur.key}`}
        aria-labelledby={`disc-tab-${cur.key}`}
      >
        {cur.kind === 'group' && <TileGrid tiles={cur.tiles!} />}
        {cur.kind === 'titles' && (
          <TitlesPanel titles={pillar.titles} applyEntry={pillar.seniority === 'entry'} />
        )}
        {cur.kind === 'ats' && (
          <AtsPanel roles={pillar.atsRoles} seniority={pillar.seniority} defaultLoc={defaultLoc} />
        )}
      </Box>
    </Box>
  );
}
