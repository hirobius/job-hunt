import { useState } from 'react';
import {
  Box, Button, Card, CardContent, Chip, Link, Stack, Tab, Tabs,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { addJob, isSaved, useJobs } from './store';
import { GROUPS, TITLES, BOARDS, ATS, ATS_ROLES, entryLevelize, type Tile } from './jobsData';

const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1.25 } as const;

function TileGrid({ tiles, cta = 'Open' }: { tiles: Tile[]; cta?: string }) {
  useJobs(); // re-render on save
  return (
    <Box sx={grid}>
      {tiles.map((t) => {
        const saved = isSaved(t.url);
        return (
          <Card key={t.url + t.name} variant="outlined">
            <CardContent sx={{ p: 1.5, pb: '12px !important', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Typography sx={{ fontWeight: 600, lineHeight: 1.2, overflowWrap: 'anywhere' }}>{t.name}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, mb: 1.25, flex: 1 }}>{t.meta}</Typography>
              <Stack direction="row" spacing={0.5}>
                <Button size="small" variant="text" component={Link} href={t.url} target="_blank" rel="noopener noreferrer">{cta}</Button>
                <Button size="small" variant={saved ? 'text' : 'outlined'} disabled={saved}
                  onClick={() => addJob(t.url, t.name)}>{saved ? 'Saved' : 'Save'}</Button>
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}

function TitlesPanel() {
  const [title, setTitle] = useState(TITLES[0]);
  const term = `"${title}"`;
  const tiles: Tile[] = BOARDS.map((b) => ({ name: b.name, meta: b.tag, url: entryLevelize(b.build(term)) }));
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Pick a title — searches fire entry-level filtered across every board.
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
        {TITLES.map((tt) => (
          <Chip key={tt} label={tt} onClick={() => setTitle(tt)}
            color={tt === title ? 'primary' : 'default'} variant={tt === title ? 'filled' : 'outlined'} size="small" />
        ))}
      </Box>
      <TileGrid tiles={tiles} cta="Search" />
    </Box>
  );
}

function AtsPanel() {
  const [role, setRole] = useState(ATS_ROLES[0]);
  const [loc, setLoc] = useState<'remote' | 'spokane' | 'both'>('remote');
  const [recency, setRecency] = useState<'' | 'w' | 'm'>('');
  const locClause = loc === 'spokane' ? '("Spokane" OR Washington)' : loc === 'both' ? '(remote OR "Spokane")' : 'remote';
  const gUrl = (site: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(`${site} "${role}" (entry OR junior OR associate) ${locClause}`)}${recency ? '&tbs=qdr:' + recency : ''}`;
  const tiles: Tile[] = ATS.map((a) => ({ name: a.name, meta: a.domain, url: gUrl(a.site) }));
  const allUrl = gUrl('(' + ATS.map((a) => a.site).join(' OR ') + ')');
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
        Search companies' hiring systems straight through Google — far less competition.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <TextField size="small" label="Role / title" value={role} onChange={(e) => setRole(e.target.value)} sx={{ minWidth: 180 }} />
        <ToggleButtonGroup size="small" exclusive value={loc} onChange={(_, v) => v && setLoc(v)}>
          <ToggleButton value="remote">Remote</ToggleButton>
          <ToggleButton value="spokane">Spokane</ToggleButton>
          <ToggleButton value="both">Both</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup size="small" exclusive value={recency} onChange={(_, v) => setRecency(v ?? '')}>
          <ToggleButton value="">Any time</ToggleButton>
          <ToggleButton value="w">Past week</ToggleButton>
          <ToggleButton value="m">Past month</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 0.5 }}>
        {ATS_ROLES.map((r) => (
          <Chip key={r} label={r} size="small" onClick={() => setRole(r)} variant="outlined" />
        ))}
      </Box>
      <Button variant="contained" sx={{ my: 1.5 }} component={Link} href={allUrl} target="_blank" rel="noopener noreferrer">
        Search all platforms
      </Button>
      <TileGrid tiles={tiles} cta="Search" />
    </Box>
  );
}

type TabDesc = { key: string; label: string; kind: 'group' | 'titles' | 'ats'; tiles?: Tile[] };

export default function DiscoverView() {
  const brief = GROUPS.find((g) => g.id === 'brief')!;
  const rest = GROUPS.filter((g) => g.id !== 'brief');
  const tabs: TabDesc[] = [
    { key: 'brief', label: 'Apply Now', kind: 'group', tiles: brief.tiles },
    { key: 'titles', label: 'Title search', kind: 'titles' },
    { key: 'ats', label: 'ATS search', kind: 'ats' },
    ...rest.map((g) => ({ key: g.id, label: g.label, kind: 'group' as const, tiles: g.tiles })),
  ];
  const [tab, setTab] = useState(0);
  const cur = tabs[tab];
  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile
        sx={{ mb: 2, minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0.5 } }}>
        {tabs.map((tb) => <Tab key={tb.key} label={tb.label} />)}
      </Tabs>
      {cur.kind === 'group' && <TileGrid tiles={cur.tiles!} />}
      {cur.kind === 'titles' && <TitlesPanel />}
      {cur.kind === 'ats' && <AtsPanel />}
    </Box>
  );
}
