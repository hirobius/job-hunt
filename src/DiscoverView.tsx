import { lazy, Suspense, useMemo, useState } from 'react';
import {
  Button,
  Input as HdsInput,
  SegmentedControl,
  Tabs as HdsTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Tag,
  Box,
  Text,
  Disclosure,
  Stack,
} from '@hirobius/design-system';
import TileGrid from './TileGrid';
import EmptyState from './EmptyState';
import { useRoute, navigate } from './route';
import {
  BOARDS,
  ATS,
  HIDDEN_BOARDS,
  atsSearchUrl,
  entryLevelize,
  searchAllCount,
  searchAllUrl,
  type HiddenQuery,
  type HiddenSite,
  type Tile,
} from './jobsData';
import { useJobs } from './store';
import { partitionTiles } from './tileState';
import { useTileTriage } from './tileTriage';
import { consumeDiscoverSeed } from './discoverSeed';
import { useCategories, useGroups, useTiles, addCategory } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';
import type { Category, Seniority } from './curation/types';
import { ContextCaption } from './LocationControl';
import DiscoverHeader from './DiscoverHeader';
import TabsOverflowFade from './hds-gaps/TabsOverflowFade';
import { useAtLeast } from './hds-gaps/useBreakpoint';
import { useTrackContext } from './discoverContext';
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
          message="Add links you trust, or use Title and ATS search for live ones."
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

function TitlesPanel({
  titles,
  applyEntry,
  initialTitle,
  categoryId,
  onManage,
}: {
  titles: string[];
  applyEntry: boolean;
  initialTitle?: string | null;
  categoryId: string;
  onManage: () => void;
}) {
  const { where, mode } = useTrackContext(categoryId);
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
      <ContextCaption categoryId={categoryId} />
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
  categoryId,
  onManage,
}: {
  roles: string[];
  seniority: Seniority;
  categoryId: string;
  onManage: () => void;
}) {
  const { where, mode } = useTrackContext(categoryId);
  const [role, setRole] = useState(roles[0] ?? '');
  const [recency, setRecency] = useState<'' | 'w' | 'm'>('');
  const [contract, setContract] = useState(false);
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
  const query: HiddenQuery = { role, entry: seniority === 'entry', where, mode, recency, contract };
  const tilesFor = (sites: HiddenSite[]): Tile[] =>
    sites.map((a) => ({ name: a.name, meta: a.domain, url: atsSearchUrl(a.site, query) }));
  const allButton = (sites: HiddenSite[], what: string) => (
    <Button
      variant="secondary"
      size="sm"
      style={{ marginTop: 'var(--primitive-space-3)', marginBottom: 'var(--primitive-space-3)' }}
      asChild
    >
      <a href={searchAllUrl(sites, query)} target="_blank" rel="noopener noreferrer">
        {`Search the top ${searchAllCount(sites, query)} ${what} at once`}
      </a>
    </Button>
  );
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
      <ContextCaption categoryId={categoryId} />
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
        <SegmentedControl
          aria-label="Engagement"
          size="sm"
          value={contract ? 'contract' : 'any'}
          onChange={(v) => setContract(v === 'contract')}
          options={[
            { value: 'any', label: 'Any role' },
            { value: 'contract', label: 'Contract only' },
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
      <Text variant="title" as="h3" style={{ marginTop: 'var(--primitive-space-4)' }}>
        Company hiring systems
      </Text>
      {allButton(ATS, 'hiring systems')}
      <TileGrid tiles={tilesFor(ATS)} cta="Search" />
      <Text variant="title" as="h3" style={{ marginTop: 'var(--primitive-space-6)' }}>
        Freelance, startup and remote boards
      </Text>
      <Text variant="caption" style={{ color: 'var(--semantic-color-content-secondary)' }}>
        Boards with no open feed (Upwork, Contra, Wellfound…), reached through Google instead.
      </Text>
      {allButton(HIDDEN_BOARDS, 'boards')}
      <TileGrid tiles={tilesFor(HIDDEN_BOARDS)} cta="Search" />
    </Box>
  );
}

// The tools row is data-driven: adding a tool (e.g. "By company") is one entry here. Short labels
// on a phone, full names from the HDS `sm` breakpoint up (docs/specs/discover.md, "Tools vs sections").
type ToolKey = 'apply' | 'titles' | 'ats' | 'live';
const TOOLS: { key: ToolKey; label: string; short: string }[] = [
  { key: 'apply', label: 'Apply now', short: 'Apply' },
  { key: 'titles', label: 'Title search', short: 'Titles' },
  { key: 'ats', label: 'ATS search', short: 'ATS' },
  { key: 'live', label: 'Live postings', short: 'Live' },
];

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
  // The track's own sections: the first curated group is the featured "Apply now" one (never the
  // feed's watch list); the rest keep their own names.
  const sections = [
    ...(featured ? [{ key: featured.id, label: 'Apply now', tiles: tilesFor(featured.id) }] : []),
    ...rest.map((g) => ({ key: g.id, label: g.label, tiles: tilesFor(g.id) })),
  ];

  const route = useRoute();
  const wide = useAtLeast('sm');
  // A track with no sections has no "Apply now" view to show: open on Title search instead.
  const tools = sections.length ? TOOLS : TOOLS.filter((t) => t.key !== 'apply');
  const sub = route.sub;
  const tool: ToolKey =
    (tools.find((t) => t.key === sub)?.key as ToolKey | undefined) ??
    (sections.length ? 'apply' : 'titles');
  const section = sections.find((sc) => sc.key === sub) ?? sections[0];

  return (
    <Box>
      <DiscoverHeader
        categories={categories}
        cat={cat}
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
      <Stack gap="inset">
        <TabsOverflowFade value={tool}>
          <SegmentedControl
            aria-label="Search tool"
            size="sm"
            value={tool}
            onChange={(v) => navigate({ sub: v === 'apply' ? null : v })}
            options={tools.map((t) => ({ value: t.key, label: wide ? t.label : t.short }))}
          />
        </TabsOverflowFade>
        {tool === 'apply' && section && (
          <Stack gap="xs">
            <Text variant="title" as="h3">
              Your sections
            </Text>
            {/* Key the tabs by track so switching tracks resets to the first section. */}
            <HdsTabs
              key={cat.id}
              value={section.key}
              onValueChange={(v) => navigate({ sub: v === sections[0].key ? null : v })}
            >
              <TabsOverflowFade value={section.key}>
                <TabsList aria-label="Your sections" style={{ width: '100%' }}>
                  {sections.map((sc) => (
                    <TabsTrigger key={sc.key} value={sc.key}>
                      {sc.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </TabsOverflowFade>
              <TabsContent value={section.key}>
                <GroupPanel
                  tiles={section.tiles}
                  savedSet={savedSet}
                  onManage={() => setManageOpen(true)}
                />
              </TabsContent>
            </HdsTabs>
          </Stack>
        )}
        {tool === 'titles' && (
          <TitlesPanel
            titles={cat.titles}
            applyEntry={cat.seniority === 'entry'}
            initialTitle={seed}
            categoryId={cat.id}
            onManage={() => setManageOpen(true)}
          />
        )}
        {tool === 'ats' && (
          <AtsPanel
            roles={cat.atsRoles}
            seniority={cat.seniority}
            categoryId={cat.id}
            onManage={() => setManageOpen(true)}
          />
        )}
        {tool === 'live' && (
          <Suspense fallback={null}>
            <LiveFeedPanel
              key={cat.id}
              categoryId={cat.id}
              terms={cat.atsRoles.length ? cat.atsRoles : cat.titles}
              boardUrls={boardUrls}
            />
          </Suspense>
        )}
      </Stack>
    </Box>
  );
}
