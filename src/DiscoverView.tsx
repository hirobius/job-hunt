import { useMemo, useState } from 'react';
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
import { BOARDS, ATS, entryLevelize, type Tile, type WorkMode } from './jobsData';
import { useActivePillar, usePillars, useActivePillarId, setActivePillar } from './pillarStore';
import { CROSS_CUTTING_GROUPS, type Pillar, type Seniority } from './pillars';
import { useJobs } from './store';
import { partitionTiles } from './tileState';
import { consumeDiscoverSeed } from './discoverSeed';

// No board triage on Discover (that lives on the Trades board) — we only want the saved→remove
// rule here, so partition against an empty triage.
const NO_TRIAGE = { pinned: [] as string[], dismissed: [] as string[] };

// Curated group tiles, with saved ones removed (issue #57) and a "N saved → Queue" note. The
// generated Title/ATS search tiles are searches, not postings, so they aren't saveable — this
// only wraps the curated `group` tabs.
function GroupPanel({ tiles, savedSet }: { tiles: Tile[]; savedSet: ReadonlySet<string> }) {
  const { visible, saved } = partitionTiles(tiles, NO_TRIAGE, savedSet);
  return (
    <Box>
      {saved.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {saved.length} saved — in your Queue
        </Typography>
      )}
      {visible.length > 0 ? (
        <TileGrid tiles={visible} />
      ) : (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          {saved.length > 0 ? 'All saved — check your Queue.' : 'Nothing here yet.'}
        </Typography>
      )}
    </Box>
  );
}

// Sourced, dated (issue #58): remote postings are ~10% of listings but draw ~46% of applications
// (aggregate job-market data, 2024) — roughly 5× the competition. Surfaced so "remote" is a
// deliberate choice, not the default.
const REMOTE_COMPETITION_HINT =
  'Remote roles draw ~5× the applicants (2024) — local & hybrid compete less.';

// Shared work-mode + location control for the generated searches (Title + ATS). No remote default;
// the location is free text (blank = anywhere). Backed by state lifted to DiscoverBody so the
// choice persists across the two search tabs.
function LocationControl({
  where,
  mode,
  onWhere,
  onMode,
}: {
  where: string;
  mode: WorkMode;
  onWhere: (v: string) => void;
  onMode: (v: WorkMode) => void;
}) {
  return (
    <Stack spacing={1} sx={{ mb: 1.5 }}>
      <SegmentedControl
        aria-label="Work mode"
        size="sm"
        value={mode}
        onChange={(v) => onMode(v as WorkMode)}
        options={[
          { value: 'any', label: 'Any' },
          { value: 'remote', label: 'Remote' },
          { value: 'hybrid', label: 'Hybrid' },
          { value: 'onsite', label: 'On-site' },
        ]}
      />
      <Box sx={{ maxWidth: 280, '& > *': { width: '100%' } }}>
        <HdsInput
          size="sm"
          aria-label="Location"
          placeholder="City, State — blank = anywhere"
          value={mode === 'remote' ? '' : where}
          disabled={mode === 'remote'}
          onChange={(e) => onWhere(e.target.value)}
          style={{ width: '100%' }}
        />
      </Box>
      {mode === 'remote' && (
        <Typography variant="caption" color="text.secondary">
          {REMOTE_COMPETITION_HINT}
        </Typography>
      )}
    </Stack>
  );
}

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

function TitlesPanel({
  titles,
  applyEntry,
  initialTitle,
  where,
  mode,
  onWhere,
  onMode,
}: {
  titles: string[];
  applyEntry: boolean;
  initialTitle?: string | null;
  where: string;
  mode: WorkMode;
  onWhere: (v: string) => void;
  onMode: (v: WorkMode) => void;
}) {
  const [title, setTitle] = useState(initialTitle || titles[0] || '');
  if (titles.length === 0)
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        No titles in this pillar yet — add some in Manage pillars.
      </Typography>
    );
  const term = `"${title}"`;
  const loc = { where, mode };
  const tiles: Tile[] = BOARDS.map((b) => ({
    name: b.name,
    meta: b.tag,
    url: applyEntry ? entryLevelize(b.build(term, loc)) : b.build(term, loc),
  }));
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Pick a title — searches fire {applyEntry ? 'entry-level filtered ' : ''}across every board.
      </Typography>
      <LocationControl where={where} mode={mode} onWhere={onWhere} onMode={onMode} />
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
  where,
  mode,
  onWhere,
  onMode,
}: {
  roles: string[];
  seniority: Seniority;
  where: string;
  mode: WorkMode;
  onWhere: (v: string) => void;
  onMode: (v: WorkMode) => void;
}) {
  const [role, setRole] = useState(roles[0] ?? '');
  const [recency, setRecency] = useState<'' | 'w' | 'm'>('');
  if (roles.length === 0)
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        No ATS roles in this pillar yet — add some in Manage pillars.
      </Typography>
    );
  // Location clause for the Google dork: remote → the word "remote"; a city → a quoted phrase;
  // blank/any → no clause (nationwide).
  const w = where.trim();
  const locClause = mode === 'remote' ? 'remote' : w ? `"${w}"` : '';
  const levelClause = seniority === 'entry' ? ' (entry OR junior OR associate)' : '';
  const gUrl = (site: string) =>
    `https://www.google.com/search?q=${encodeURIComponent(`${site} "${role}"${levelClause}${locClause ? ' ' + locClause : ''}`)}${recency ? '&tbs=qdr:' + recency : ''}`;
  const tiles: Tile[] = ATS.map((a) => ({ name: a.name, meta: a.domain, url: gUrl(a.site) }));
  const allUrl = gUrl('(' + ATS.map((a) => a.site).join(' OR ') + ')');
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
        Search companies' hiring systems straight through Google — far less competition.
      </Typography>
      <LocationControl where={where} mode={mode} onWhere={onWhere} onMode={onMode} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <HdsInput
          size="sm"
          label="Role / title"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ minWidth: 180 }}
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
  const jobs = useJobs();
  const savedSet = useMemo(() => new Set(jobs.map((j) => j.url)), [jobs]);
  // "Find more like this" (issue #57) stashes a title before navigating here; consume it once.
  const [seed] = useState(() => consumeDiscoverSeed());
  const subIndex = route.sub ? tabs.findIndex((tb) => tb.key === route.sub) : -1;
  const tab = subIndex >= 0 ? subIndex : 0;
  const cur = tabs[tab] ?? tabs[0];
  // Shared location + work-mode for both generated-search tabs. Default: anywhere / any mode —
  // deliberately NOT remote (issue #58). Lifted here so the choice survives switching Title↔ATS.
  const [where, setWhere] = useState('');
  const [mode, setMode] = useState<WorkMode>('any');

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
          {cur.kind === 'group' && <GroupPanel tiles={cur.tiles!} savedSet={savedSet} />}
          {cur.kind === 'titles' && (
            <TitlesPanel
              titles={pillar.titles}
              applyEntry={pillar.seniority === 'entry'}
              initialTitle={seed}
              where={where}
              mode={mode}
              onWhere={setWhere}
              onMode={setMode}
            />
          )}
          {cur.kind === 'ats' && (
            <AtsPanel
              roles={pillar.atsRoles}
              seniority={pillar.seniority}
              where={where}
              mode={mode}
              onWhere={setWhere}
              onMode={setMode}
            />
          )}
        </TabsContent>
      </HdsTabs>
    </Box>
  );
}
