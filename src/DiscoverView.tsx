import { useState } from 'react';
import { Box, Stack, Typography } from './ui/box';
import {
  Button,
  Combobox,
  Input as HdsInput,
  SegmentedControl,
  Tabs as HdsTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Tag,
} from '@hirobius/design-system';
import TileGrid from './TileGrid';
import { useRoute, navigate } from './route';
import { BOARDS, ATS, entryLevelize, type Tile } from './jobsData';
import { useActivePillar, usePillars, useActivePillarId, setActivePillar } from './pillarStore';
import { CROSS_CUTTING_GROUPS, type Pillar, type Seniority } from './pillars';

// Trade switcher — moved out of the global header (it only drives this tab) into a labeled
// control here, so it reads as "which trade am I searching?" instead of a mystery dropdown.
function TradeSwitcher() {
  const pillars = usePillars();
  const activeId = useActivePillarId();
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Trade
      </Typography>
      <Combobox
        aria-label="Trade to search"
        options={pillars.map((p) => ({ value: p.id, label: p.label }))}
        value={activeId}
        onChange={setActivePillar}
        placeholder="Pick a trade"
      />
    </Box>
  );
}

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
          <Tag key={tt} active={tt === title} onClick={() => setTitle(tt)}>
            {tt}
          </Tag>
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
        <HdsInput
          size="sm"
          label="Role / title"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ minWidth: 180 }}
        />
        <SegmentedControl
          aria-label="Location"
          size="sm"
          value={loc}
          onChange={(v) => setLoc(v as typeof loc)}
          options={[
            { value: 'remote', label: 'Remote' },
            { value: 'spokane', label: 'Spokane' },
            { value: 'both', label: 'Both' },
          ]}
        />
        <SegmentedControl
          aria-label="Recency"
          size="sm"
          value={recency}
          onChange={(v) => setRecency(v as typeof recency)}
          options={[
            { value: '', label: 'Any time' },
            { value: 'w', label: 'Past week' },
            { value: 'm', label: 'Past month' },
          ]}
        />
      </Stack>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 0.5 }}>
        {roles.map((r) => (
          <Tag key={r} onClick={() => setRole(r)}>
            {r}
          </Tag>
        ))}
      </Box>
      <Button variant="primary" style={{ marginTop: 12, marginBottom: 12 }} asChild>
        <a href={allUrl} target="_blank" rel="noopener noreferrer">
          Search all platforms
        </a>
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
      <TradeSwitcher />
      {/* HDS underline tabs; the sub-tab key IS the Radix value (index 0 → bare #/discover).
          Only the active panel exists, so one TabsContent keyed to the active value suffices. */}
      <HdsTabs
        value={cur.key}
        onValueChange={(v) => navigate({ sub: v === tabs[0].key ? null : v })}
      >
        <TabsList style={{ marginBottom: 16, width: '100%' }}>
          {tabs.map((tb) => (
            <TabsTrigger key={tb.key} value={tb.key}>
              {tb.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={cur.key}>
          {cur.kind === 'group' && <TileGrid tiles={cur.tiles!} />}
          {cur.kind === 'titles' && (
            <TitlesPanel titles={pillar.titles} applyEntry={pillar.seniority === 'entry'} />
          )}
          {cur.kind === 'ats' && (
            <AtsPanel
              roles={pillar.atsRoles}
              seniority={pillar.seniority}
              defaultLoc={defaultLoc}
            />
          )}
        </TabsContent>
      </HdsTabs>
    </Box>
  );
}
