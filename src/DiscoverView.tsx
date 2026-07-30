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
import { useJobs } from './store';
import { partitionTiles } from './tileState';
import { consumeDiscoverSeed } from './discoverSeed';
import { useCategories, useGroups, useTiles } from './curation/curationStore';
import type { Category, Seniority } from './curation/types';
import { Onboarding } from './Onboarding';

// Discover reads the per-account CURATION STORE (categories→groups→tiles), not the old hardcoded
// pillars (B1 / #30). A Category IS a track: its titles/atsRoles/seniority/location drive the
// generated Title & ATS searches; its groups→tiles are the curated "Apply Now"/section content.
// An empty store routes to first-run Onboarding (decision D1).

const ACTIVE_CATEGORY_KEY = 'rjb_active_category';

// No board triage on Discover's generated tiles — we only want the saved→remove rule here, so
// partition against an empty triage.
const NO_TRIAGE = { pinned: [] as string[], dismissed: [] as string[] };

const REMOTE_COMPETITION_HINT =
  'Remote roles draw ~5× the applicants (2024) — local & hybrid compete less.';

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

// Curated group tiles, with saved ones removed (issue #57) and a "N saved → Queue" note.
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

function CategorySwitcher({
  categories,
  activeId,
  onChange,
}: {
  categories: Category[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        Track
      </Typography>
      <Combobox
        aria-label="Track to search"
        options={categories.map((c) => ({ value: c.id, label: c.label }))}
        value={activeId}
        onChange={onChange}
        placeholder="Pick a track"
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
        No titles in this track yet — add some with the track controls.
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
        No ATS roles in this track yet — add some with the track controls.
      </Typography>
    );
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
  const categories = useCategories();
  // Empty store → first-run onboarding (decision D1). Once a pack is seeded, categories is
  // non-empty and this re-renders straight into Discover.
  if (categories.length === 0) return <Onboarding />;
  return <DiscoverInner categories={categories} />;
}

function loadActiveCategory(categories: Category[]): string {
  try {
    const stored = localStorage.getItem(ACTIVE_CATEGORY_KEY);
    if (stored && categories.some((c) => c.id === stored)) return stored;
  } catch {
    /* ignore */
  }
  return categories[0].id;
}

function DiscoverInner({ categories }: { categories: Category[] }) {
  const allGroups = useGroups();
  const allTiles = useTiles();
  const jobs = useJobs();
  const savedSet = useMemo(() => new Set(jobs.map((j) => j.url)), [jobs]);
  const [seed] = useState(() => consumeDiscoverSeed());
  const [activeId, setActiveId] = useState(() => loadActiveCategory(categories));
  const [where, setWhere] = useState('');
  const [mode, setMode] = useState<WorkMode>('any');

  const cat = categories.find((c) => c.id === activeId) ?? categories[0];
  const setActive = (id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(ACTIVE_CATEGORY_KEY, id);
    } catch {
      /* ignore */
    }
  };

  // Assemble the active category's normalized groups → tiles (jobsData Tile shape for TileGrid).
  const catGroups = useMemo(
    () =>
      allGroups
        .filter((g) => g.categoryId === cat.id && !g.archived)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [allGroups, cat.id],
  );
  const tilesFor = (groupId: string): Tile[] =>
    allTiles
      .filter((t) => t.groupId === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({ name: t.name, meta: t.meta, url: t.url }));

  const featured = catGroups[0];
  const rest = catGroups.slice(1);
  const tabs: TabDesc[] = [
    ...(featured
      ? [{ key: featured.id, label: 'Apply Now', kind: 'group' as const, tiles: tilesFor(featured.id) }]
      : []),
    { key: 'titles', label: 'Title search', kind: 'titles' },
    { key: 'ats', label: 'ATS search', kind: 'ats' },
    ...rest.map((g) => ({ key: g.id, label: g.label, kind: 'group' as const, tiles: tilesFor(g.id) })),
  ];

  const route = useRoute();
  const subIndex = route.sub ? tabs.findIndex((tb) => tb.key === route.sub) : -1;
  const tab = subIndex >= 0 ? subIndex : 0;
  const cur = tabs[tab] ?? tabs[0];

  return (
    <Box>
      <CategorySwitcher categories={categories} activeId={cat.id} onChange={setActive} />
      {/* Key the tabs by category so switching tracks resets to the first sub-tab. */}
      <HdsTabs
        key={cat.id}
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
              titles={cat.titles}
              applyEntry={cat.seniority === 'entry'}
              initialTitle={seed}
              where={where}
              mode={mode}
              onWhere={setWhere}
              onMode={setMode}
            />
          )}
          {cur.kind === 'ats' && (
            <AtsPanel
              roles={cat.atsRoles}
              seniority={cat.seniority}
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
