import { lazy, Suspense, useMemo, useState } from 'react';
import {
  Button,
  Input as HdsInput,
  SegmentedControl,
  Tag,
  Icon,
  Box,
  Stack,
  Text,
  Disclosure,
} from '@hirobius/design-system';
import { ChevronDown } from 'lucide-react';
import TileGrid from './TileGrid';
import EmptyState from './EmptyState';
import { Sheet, SheetMenu } from './Sheet';
import { useRoute, navigate } from './route';
import { BOARDS, ATS, entryLevelize, type Tile, type WorkMode } from './jobsData';
import { useJobs } from './store';
import { partitionTiles } from './tileState';
import { useTileTriage } from './tileTriage';
import { consumeDiscoverSeed } from './discoverSeed';
import { useCategories, useGroups, useTiles, addCategory } from './curation/curationStore';
import { STARTER_PACKS, seedPack } from './curation/starterPacks';
import type { Category, Seniority } from './curation/types';
import { Onboarding } from './Onboarding';
import LocationControl from './LocationControl';
import { WATCH_GROUP_LABEL, boardUrlsFor } from './feed/watchlist';

const ManageTrackDialog = lazy(() => import('./ManageTrackDialog'));
const LiveFeedPanel = lazy(() => import('./LiveFeedPanel'));

// Discover reads the per-account CURATION STORE (categories→groups→tiles), not the old hardcoded
// pillars (B1 / #30). A Category IS a track: its titles/atsRoles/seniority/location drive the
// generated title & company-board searches; its groups→tiles are the curated Links.
// An empty store routes to first-run Onboarding (decision D1).
//
// v1 shape: a track button (→ track Sheet), then Links · Search · Postings. The URL slugs are the
// pre-v1 ones, so old links keep working: Links = #/discover (or a curated-group id),
// Search = #/discover/titles | #/discover/ats, Postings = #/discover/live.

const ACTIVE_CATEGORY_KEY = 'rjb_active_category';

type Segment = 'links' | 'search' | 'live';
type SearchBy = 'titles' | 'ats';

const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

// Curated group tiles: saved ones removed (issue #57), pin/set-aside triage kept (decision D2).
function GroupPanel({
  label,
  tiles,
  savedSet,
  onManage,
}: {
  label: string;
  tiles: Tile[];
  savedSet: ReadonlySet<string>;
  onManage: () => void;
}) {
  const triage = useTileTriage();
  const { visible, saved, aside } = partitionTiles(tiles, triage, savedSet);
  return (
    <Stack gap="tight">
      <Text variant="ui" as="h2" style={{ fontWeight: 600 }}>
        {label}
      </Text>
      {saved.length > 0 && (
        <Text variant="caption" as="span" style={SECONDARY}>
          {saved.length} saved — in your Tracker
        </Text>
      )}
      {visible.length > 0 ? (
        <TileGrid tiles={visible} triage label={label} />
      ) : saved.length > 0 ? (
        <EmptyState message="All saved — check your Tracker for these." />
      ) : (
        <EmptyState
          title="No links here yet"
          message="Add curated links to this section, or switch to Search to generate live ones."
          action={
            <Button variant="secondary" size="sm" onClick={onManage}>
              Manage this track
            </Button>
          }
        />
      )}
      {aside.length > 0 && (
        <Disclosure label={`Set aside (${aside.length})`}>
          <TileGrid tiles={aside} triage label={`${label}, set aside`} />
        </Disclosure>
      )}
    </Stack>
  );
}

function LinksPanel({
  groups,
  tilesFor,
  savedSet,
  onManage,
}: {
  groups: { id: string; label: string }[];
  tilesFor: (groupId: string) => Tile[];
  savedSet: ReadonlySet<string>;
  onManage: () => void;
}) {
  if (groups.length === 0)
    return (
      <EmptyState
        title="No links yet"
        message="Add curated links to this track, or use Search to generate live ones."
        action={
          <Button variant="secondary" size="sm" onClick={onManage}>
            Manage this track
          </Button>
        }
      />
    );
  return (
    <Stack gap="normal">
      <Text variant="ui" style={SECONDARY}>
        Curated searches for your track. Open runs the search; Save keeps the link in your Tracker.
      </Text>
      {groups.map((g) => (
        <GroupPanel
          key={g.id}
          label={g.label}
          tiles={tilesFor(g.id)}
          savedSet={savedSet}
          onManage={onManage}
        />
      ))}
    </Stack>
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
    <Stack gap="normal">
      <Text variant="ui" style={SECONDARY}>
        Pick a title — searches fire {applyEntry ? 'entry-level filtered ' : ''}across every board.
      </Text>
      <LocationControl where={where} mode={mode} onWhere={onWhere} onMode={onMode} />
      <Stack gap="tight">
        <Text variant="caption" as="span" style={SECONDARY}>
          Title
        </Text>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs' }}>
          {titles.map((tt) => (
            <Tag key={tt} active={tt === title} onClick={() => setTitle(tt)}>
              {tt}
            </Tag>
          ))}
        </Box>
      </Stack>
      <TileGrid tiles={tiles} cta="Search" label="Search boards" />
    </Stack>
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
        title="No company-board role terms yet"
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
    <Stack gap="normal">
      <Text variant="ui" style={SECONDARY}>
        Search companies' hiring systems straight through Google — far less competition.
      </Text>
      <LocationControl where={where} mode={mode} onWhere={onWhere} onMode={onMode} />
      <HdsInput
        size="sm"
        label="Role / title"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        style={{ width: '100%' }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs' }}>
        {roles.map((r) => (
          <Tag key={r} active={r === role} onClick={() => setRole(r)}>
            {r}
          </Tag>
        ))}
      </Box>
      <Stack gap="tight">
        <Text variant="caption" as="span" style={SECONDARY}>
          Posted
        </Text>
        <SegmentedControl
          aria-label="Posted"
          size="sm"
          fullWidth
          value={recency}
          onChange={(v) => setRecency(v as typeof recency)}
          options={[
            { value: '', label: 'Any time' },
            { value: 'w', label: 'Past week' },
            { value: 'm', label: 'Past month' },
          ]}
        />
      </Stack>
      <Button variant="primary" style={{ width: '100%' }} asChild>
        <a href={allUrl} target="_blank" rel="noopener noreferrer">
          Search all platforms
        </a>
      </Button>
      <TileGrid tiles={tiles} cta="Search" label="Company-board platforms" />
    </Stack>
  );
}

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

type SheetKind = null | 'tracks' | 'new';

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
  const [sheet, setSheet] = useState<SheetKind>(null);

  const cat = categories.find((c) => c.id === activeId) ?? categories[0];
  const setActive = (id: string) => {
    setActiveId(id);
    try {
      localStorage.setItem(ACTIVE_CATEGORY_KEY, id);
    } catch {
      /* ignore */
    }
  };
  const openManage = () => {
    setSheet(null);
    setManageOpen(true);
  };

  // Blank track: create an empty category, switch to it, and open the editor to fill it in.
  const handleBlank = () => {
    const id = addCategory({ label: 'New track' });
    setActive(id);
    setSheet(null);
    setManageOpen(true);
  };
  // Pack track: seed a ready-made starter pack (e.g. ServiceNow) as a new track and switch to it.
  // No auto-open of the editor — the pack arrives pre-filled and immediately usable.
  const handleSeedPack = (packId: string) => {
    const id = seedPack(packId);
    setActive(id);
    setSheet(null);
  };

  // The active category's normalized groups → tiles (jobsData Tile shape for TileGrid). The first
  // curated group (the old "Apply Now") leads; the watch list rides along so it can be managed.
  const catGroups = useMemo(() => {
    const live = allGroups
      .filter((g) => g.categoryId === cat.id && !g.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const featured = live.find((g) => g.label !== WATCH_GROUP_LABEL);
    return featured ? [featured, ...live.filter((g) => g !== featured)] : live;
  }, [allGroups, cat.id]);
  const tilesFor = (groupId: string): Tile[] =>
    allTiles
      .filter((t) => t.groupId === groupId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({ name: t.name, meta: t.meta, url: t.url }));
  // Board tiles anywhere on the track feed Live postings (see src/feed/watchlist.ts).
  const boardUrls = useMemo(
    () => boardUrlsFor(cat.id, { categories, groups: allGroups, tiles: allTiles }),
    [cat.id, categories, allGroups, allTiles],
  );

  const route = useRoute();
  const searchBy: SearchBy = route.sub === 'ats' ? 'ats' : 'titles';
  const segment: Segment =
    route.sub === 'titles' || route.sub === 'ats'
      ? 'search'
      : route.sub === 'live'
        ? 'live'
        : 'links';
  const packs = STARTER_PACKS.filter((p) => p.id !== 'blank');

  const onSegment = (v: string) => {
    if (v === segment) return;
    navigate({ sub: v === 'search' ? 'titles' : v === 'live' ? 'live' : null });
  };

  return (
    <Stack gap="normal">
      <Button
        variant="secondary"
        iconRight={<Icon icon={ChevronDown} />}
        onClick={() => setSheet('tracks')}
        style={{ width: '100%', justifyContent: 'space-between', textAlign: 'left' }}
      >
        <Box as="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <Text variant="caption" as="span" style={{ color: 'inherit', opacity: 0.8 }}>
            Track
          </Text>
          <Text variant="ui" as="span" style={{ color: 'inherit', fontWeight: 600 }}>
            {cat.label}
          </Text>
        </Box>
      </Button>

      <Sheet
        open={sheet === 'tracks'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="Choose a track"
      >
        <SheetMenu
          label="Tracks"
          items={categories.map((c) => ({
            label: c.label,
            selected: c.id === cat.id,
            onSelect: () => {
              setActive(c.id);
              setSheet(null);
            },
          }))}
        />
        <SheetMenu
          label="Track actions"
          items={[
            { label: 'Manage this track', onSelect: openManage },
            { label: 'New track', onSelect: () => setSheet('new') },
          ]}
        />
      </Sheet>
      <Sheet
        open={sheet === 'new'}
        onOpenChange={(o) => !o && setSheet(null)}
        title="New track"
        description="Start from a pack, or build your own."
      >
        <SheetMenu
          label="Starter packs"
          items={[
            ...packs.map((p) => ({ label: p.label, onSelect: () => handleSeedPack(p.id) })),
            { label: 'Blank track', onSelect: handleBlank },
          ]}
        />
      </Sheet>
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

      <SegmentedControl
        aria-label="Discover sections"
        fullWidth
        value={segment}
        onChange={onSegment}
        options={[
          { value: 'links', label: 'Links' },
          { value: 'search', label: 'Search' },
          { value: 'live', label: 'Postings' },
        ]}
      />

      {segment === 'links' && (
        <LinksPanel
          groups={catGroups}
          tilesFor={tilesFor}
          savedSet={savedSet}
          onManage={openManage}
        />
      )}
      {segment === 'search' && (
        <Stack gap="normal">
          <SegmentedControl
            aria-label="Search by"
            size="sm"
            fullWidth
            value={searchBy}
            onChange={(v) => navigate({ sub: v })}
            options={[
              { value: 'titles', label: 'By title' },
              { value: 'ats', label: 'By company board' },
            ]}
          />
          {/* Keyed by track so switching tracks resets the picked title / role. */}
          {searchBy === 'titles' ? (
            <TitlesPanel
              key={cat.id}
              titles={cat.titles}
              applyEntry={cat.seniority === 'entry'}
              initialTitle={seed}
              where={where}
              mode={mode}
              onWhere={setWhere}
              onMode={setMode}
              onManage={openManage}
            />
          ) : (
            <AtsPanel
              key={cat.id}
              roles={cat.atsRoles}
              seniority={cat.seniority}
              where={where}
              mode={mode}
              onWhere={setWhere}
              onMode={setMode}
              onManage={openManage}
            />
          )}
        </Stack>
      )}
      {segment === 'live' && (
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
    </Stack>
  );
}
