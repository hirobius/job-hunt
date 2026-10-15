import { lazy, Suspense, useMemo, useState } from 'react';
import {
  Button,
  Combobox,
  Input as HdsInput,
  Menu as HdsMenu,
  SegmentedControl,
  Tabs as HdsTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Tag,
  Icon,
  Box,
  Text,
  Disclosure,
} from '@hirobius/design-system';
import { Plus, SlidersHorizontal } from 'lucide-react';
import TileGrid from './TileGrid';
import EmptyState from './EmptyState';
import { useRoute, navigate } from './route';
import { BOARDS, ATS, entryLevelize, type Tile, type WorkMode } from './jobsData';
import { useJobs } from './store';
import { partitionTiles } from './tileState';
import { useTileTriage } from './tileTriage';
import { consumeDiscoverSeed } from './discoverSeed';
import { useCategories, useGroups, useTiles, addCategory } from './curation/curationStore';
import { STARTER_PACKS, seedPack } from './curation/starterPacks';
import type { Category, Seniority } from './curation/types';
import LocationControl from './LocationControl';
import { WATCH_GROUP_LABEL, boardUrlsFor } from './feed/watchlist';

const ManageTrackDialog = lazy(() => import('./ManageTrackDialog'));
const LiveFeedPanel = lazy(() => import('./LiveFeedPanel'));

// Discover reads the per-account CURATION STORE (categories→groups→tiles), not the old hardcoded
// pillars (B1 / #30). A Category IS a track: its titles/atsRoles/seniority/location drive the
// generated Title & ATS searches; its groups→tiles are the curated "Apply Now"/section content.
// An empty store routes to first-run Onboarding (decision D1), gated by the shell (#128).

const ACTIVE_CATEGORY_KEY = 'rjb_active_category';

// Curated group tiles: saved ones removed (issue #57), pin/set-aside triage kept (decision D2).
function GroupPanel({
  tiles,
  savedSet,
  onManage,
}: {
  tiles: Tile[];
  savedSet: ReadonlySet<string>;
  onManage: () => void;
}) {
  const triage = useTileTriage();
  const { visible, saved, aside } = partitionTiles(tiles, triage, savedSet);
  return (
    <Box>
      {saved.length > 0 && (
        <Text
          variant="caption"
          as="span"
          style={{
            color: 'var(--semantic-color-content-secondary)',
            display: 'block',
            marginBottom: 'var(--semantic-space-scale-xs)',
          }}
        >
          {saved.length} saved — in your Queue
        </Text>
      )}
      {visible.length > 0 ? (
        <TileGrid tiles={visible} triage />
      ) : saved.length > 0 ? (
        <EmptyState message="All saved — check your Tracker for these." />
      ) : (
        <EmptyState
          title="No links here yet"
          message="Add curated links to this section, or switch to Title / ATS search to generate live ones."
          action={
            <Button variant="secondary" size="sm" onClick={onManage}>
              Manage this track
            </Button>
          }
        />
      )}
      {aside.length > 0 && (
        <Box sx={{ mt: 'xs' }}>
          <Disclosure label={`Set aside (${aside.length})`}>
            <TileGrid tiles={aside} triage />
          </Disclosure>
        </Box>
      )}
    </Box>
  );
}

function CategorySwitcher({
  categories,
  activeId,
  onChange,
  onSeedPack,
  onBlank,
  onManage,
}: {
  categories: Category[];
  activeId: string;
  onChange: (id: string) => void;
  onSeedPack: (packId: string) => void;
  onBlank: () => void;
  onManage: () => void;
}) {
  // Packs the user can pull in as a ready-made track (skip "blank" — that's the explicit
  // "Blank track" item below). Lets an existing user add e.g. the ServiceNow track any time,
  // not only at first-run onboarding.
  const packs = STARTER_PACKS.filter((p) => p.id !== 'blank');
  return (
    <Box sx={{ mb: 'sm' }}>
      <Text
        variant="caption"
        as="span"
        style={{
          color: 'var(--semantic-color-content-secondary)',
          display: 'block',
          marginBottom: 'var(--primitive-space-1)',
        }}
      >
        Track
      </Text>
      <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1.5, alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
          <Combobox
            aria-label="Track to search"
            options={categories.map((c) => ({ value: c.id, label: c.label }))}
            value={activeId}
            onChange={onChange}
            placeholder="Pick a track"
          />
        </Box>
        <Button
          size="sm"
          variant="tertiary"
          iconOnly
          iconLeft={<Icon icon={SlidersHorizontal} />}
          label="Manage this track"
          onClick={onManage}
        />
        <HdsMenu>
          <HdsMenu.Trigger asChild>
            <Button
              size="sm"
              variant="secondary"
              iconOnly
              iconLeft={<Icon icon={Plus} />}
              label="New track"
            />
          </HdsMenu.Trigger>
          <HdsMenu.Content align="end">
            <HdsMenu.Label>Start from a pack</HdsMenu.Label>
            {packs.map((p) => (
              <HdsMenu.Item key={p.id} onSelect={() => onSeedPack(p.id)}>
                {p.label}
              </HdsMenu.Item>
            ))}
            <HdsMenu.Separator />
            <HdsMenu.Item onSelect={onBlank}>Blank track</HdsMenu.Item>
          </HdsMenu.Content>
        </HdsMenu>
      </Box>
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
  onManage,
}: {
  titles: string[];
  applyEntry: boolean;
  initialTitle?: string | null;
  where: string;
  mode: WorkMode;
  onWhere: (v: string) => void;
  onMode: (v: WorkMode) => void;
  onManage: () => void;
}) {
  const [title, setTitle] = useState(initialTitle || titles[0] || '');
  if (titles.length === 0)
    return (
      <EmptyState
        title="No title-search terms yet"
        message="Add a few job titles to this track and we'll fan them out across every job board."
        action={
          <Button variant="secondary" size="sm" onClick={onManage}>
            Add titles
          </Button>
        }
      />
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
      <Text
        variant="ui"
        style={{
          color: 'var(--semantic-color-content-secondary)',
          marginBottom: 'var(--semantic-space-scale-xs)',
        }}
      >
        Pick a title — searches fire {applyEntry ? 'entry-level filtered ' : ''}across every board.
      </Text>
      <LocationControl where={where} mode={mode} onWhere={onWhere} onMode={onMode} />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 'sm' }}>
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
  onManage,
}: {
  roles: string[];
  seniority: Seniority;
  where: string;
  mode: WorkMode;
  onWhere: (v: string) => void;
  onMode: (v: WorkMode) => void;
  onManage: () => void;
}) {
  const [role, setRole] = useState(roles[0] ?? '');
  const [recency, setRecency] = useState<'' | 'w' | 'm'>('');
  if (roles.length === 0)
    return (
      <EmptyState
        title="No ATS role terms yet"
        message="Add role keywords and we'll search companies' hiring systems (Greenhouse, Lever, Ashby…) straight through Google — far less competition."
        action={
          <Button variant="secondary" size="sm" onClick={onManage}>
            Add roles
          </Button>
        }
      />
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
      <Text
        variant="ui"
        style={{
          color: 'var(--semantic-color-content-secondary)',
          marginBottom: 'calc(var(--primitive-space-1) * 2.5)',
        }}
      >
        Search companies' hiring systems straight through Google — far less competition.
      </Text>
      <LocationControl where={where} mode={mode} onWhere={onWhere} onMode={onMode} />
      {/* Mobile-first: a column that becomes a row from sm. HDS sx has no base breakpoint (hds#652), so the base value sits on the key and the override nests under '&'. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          mb: 3,
          '&': { flexDirection: { sm: 'row' } },
        }}
      >
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
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 1 }}>
        {roles.map((r) => (
          <Tag key={r} onClick={() => setRole(r)}>
            {r}
          </Tag>
        ))}
      </Box>
      <Button
        variant="primary"
        style={{ marginTop: 'var(--primitive-space-3)', marginBottom: 'var(--primitive-space-3)' }}
        asChild
      >
        <a href={allUrl} target="_blank" rel="noopener noreferrer">
          Search all platforms
        </a>
      </Button>
      <TileGrid tiles={tiles} cta="Search" />
    </Box>
  );
}

type TabDesc = {
  key: string;
  label: string;
  kind: 'group' | 'titles' | 'ats' | 'live';
  tiles?: Tile[];
};

export default function DiscoverView() {
  const categories = useCategories();
  // No tracks → the shell shows onboarding instead of this view (App.tsx, #128).
  if (categories.length === 0) return null;
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
  const [manageOpen, setManageOpen] = useState(false);

  const cat = categories.find((c) => c.id === activeId) ?? categories[0];
  const setActive = (id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(ACTIVE_CATEGORY_KEY, id);
    } catch {
      /* ignore */
    }
  };

  // Blank track: create an empty category, switch to it, and open the editor to fill it in.
  const handleBlank = () => {
    const id = addCategory({ label: 'New track' });
    setActive(id);
    setManageOpen(true);
  };
  // Pack track: seed a ready-made starter pack (e.g. ServiceNow) as a new track and switch to it.
  // No auto-open of the editor — the pack arrives pre-filled and immediately usable.
  const handleSeedPack = (packId: string) => {
    const id = seedPack(packId);
    setActive(id);
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

  // The first curated group is the featured "Apply Now" tab — never the feed's watch list.
  const featured = catGroups.find((g) => g.label !== WATCH_GROUP_LABEL);
  const rest = catGroups.filter((g) => g !== featured);
  // Board tiles anywhere on the track feed Live postings (see src/feed/watchlist.ts).
  const boardUrls = useMemo(
    () => boardUrlsFor(cat.id, { categories, groups: allGroups, tiles: allTiles }),
    [cat.id, categories, allGroups, allTiles],
  );
  const tabs: TabDesc[] = [
    ...(featured
      ? [
          {
            key: featured.id,
            label: 'Apply Now',
            kind: 'group' as const,
            tiles: tilesFor(featured.id),
          },
        ]
      : []),
    { key: 'titles', label: 'Title search', kind: 'titles' },
    { key: 'ats', label: 'ATS search', kind: 'ats' },
    { key: 'live', label: 'Live postings', kind: 'live' },
    ...rest.map((g) => ({
      key: g.id,
      label: g.label,
      kind: 'group' as const,
      tiles: tilesFor(g.id),
    })),
  ];

  const route = useRoute();
  const subIndex = route.sub ? tabs.findIndex((tb) => tb.key === route.sub) : -1;
  const tab = subIndex >= 0 ? subIndex : 0;
  const cur = tabs[tab] ?? tabs[0];

  return (
    <Box>
      <CategorySwitcher
        categories={categories}
        activeId={cat.id}
        onChange={setActive}
        onSeedPack={handleSeedPack}
        onBlank={handleBlank}
        onManage={() => setManageOpen(true)}
      />
      {manageOpen && (
        <Suspense fallback={null}>
          <ManageTrackDialog
            categoryId={cat.id}
            open
            onClose={() => setManageOpen(false)}
            onDeleted={() => setManageOpen(false)}
          />
        </Suspense>
      )}
      {/* Key the tabs by category so switching tracks resets to the first sub-tab. */}
      <HdsTabs
        key={cat.id}
        value={cur.key}
        onValueChange={(v) => navigate({ sub: v === tabs[0].key ? null : v })}
      >
        <TabsList style={{ marginBottom: 'var(--primitive-space-4)', width: '100%' }}>
          {tabs.map((tb) => (
            <TabsTrigger key={tb.key} value={tb.key}>
              {tb.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={cur.key}>
          {cur.kind === 'group' && (
            <GroupPanel
              tiles={cur.tiles!}
              savedSet={savedSet}
              onManage={() => setManageOpen(true)}
            />
          )}
          {cur.kind === 'titles' && (
            <TitlesPanel
              titles={cat.titles}
              applyEntry={cat.seniority === 'entry'}
              initialTitle={seed}
              where={where}
              mode={mode}
              onWhere={setWhere}
              onMode={setMode}
              onManage={() => setManageOpen(true)}
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
              onManage={() => setManageOpen(true)}
            />
          )}
          {cur.kind === 'live' && (
            <Suspense fallback={null}>
              <LiveFeedPanel
                key={cat.id}
                categoryId={cat.id}
                terms={cat.atsRoles.length ? cat.atsRoles : cat.titles}
                boardUrls={boardUrls}
                where={where}
                mode={mode}
                onWhere={setWhere}
                onMode={setMode}
              />
            </Suspense>
          )}
        </TabsContent>
      </HdsTabs>
    </Box>
  );
}
