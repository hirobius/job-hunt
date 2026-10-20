import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Disclosure,
  EmptyState,
  InlineLink,
  Input as HdsInput,
  SegmentedControl,
  Stack,
  Tabs as HdsTabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tag,
  Text,
} from '@hirobius/design-system';
import TileGrid from './TileGrid';
import { useRoute, navigate } from './route';
import {
  BOARDS,
  ATS,
  HIDDEN_BOARDS,
  atsSearchUrl,
  entryLevelize,
  searchAllCount,
  searchAllUrl,
  titleClause,
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
import { BARE_PANEL } from './hds-gaps/barePanel';

const SECTION_PANEL = { ...BARE_PANEL, paddingTop: 'var(--primitive-space-4)' } as const;
import { useAtLeast } from './hds-gaps/useBreakpoint';
import { useTrackContext } from './discoverContext';
import { DISCOVERY_SOURCE_ENABLED } from './feed/discoverySources';
import { teamSearchFor } from './feed/teamTopics';
import { WATCH_GROUP_LABEL, boardUrlsFor } from './feed/watchlist';
import { useActiveTitles } from './feed/sweepTitles';
import { useDreams } from './feed/dreams';
import { boardsFromUrls } from './feed/sources/ats';
import { SweepTitlesEditor } from './SweepTitles';

const ManageTrackDialog = lazy(() => import('./ManageTrackDialog'));
const LiveFeedPanel = lazy(() => import('./LiveFeedPanel'));
const FindBoardsPanel = lazy(() => import('./FindBoardsPanel'));
const CompaniesPanel = lazy(() => import('./CompaniesPanel'));

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
        <Box sx={{ mb: 'xs' }}>
          <Text variant="caption" as="div" tone="secondary">
            {saved.length} saved — in your Queue
          </Text>
        </Box>
      )}
      {visible.length > 0 ? (
        <TileGrid tiles={visible} triage />
      ) : saved.length > 0 ? (
        <EmptyState title="All saved — check your Tracker for these." />
      ) : (
        <EmptyState
          title="No links here yet"
          description="Add links you trust, or use Title and ATS search for live ones."
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

// Search links built from the track's ticked titles (#223): every one is on by default ("All
// selected"); a chip or the input narrows to one. The big boards and companies' hiring systems
// both read them (the Titles tool folded in here).
function AtsPanel({
  titles,
  seniority,
  categoryId,
  initialTitle,
  onManage,
}: {
  /** The track's titles: the title filter's list until edited (#213, #223). */
  titles: string[];
  seniority: Seniority;
  categoryId: string;
  /** A title "Find more like this" seeded (#57). */
  initialTitle?: string | null;
  onManage: () => void;
}) {
  const { where, mode } = useTrackContext(categoryId);
  const active = useActiveTitles(categoryId, titles);
  const [role, setRole] = useState(initialTitle || active[0] || '');
  const [all, setAll] = useState(!initialTitle);
  const many = all && active.length > 1;
  const [recency, setRecency] = useState<'' | 'w' | 'm'>('');
  const [contract, setContract] = useState(false);
  if (titles.length === 0)
    return (
      <EmptyState
        title="No titles yet"
        description="Add a few job titles to this track and we'll search the big boards and companies' hiring systems (Greenhouse, Lever, Ashby…) for them."
        action={
          <Button variant="secondary" size="sm" onClick={onManage}>
            Add titles
          </Button>
        }
      />
    );
  const entry = seniority === 'entry';
  const term = titleClause(many ? active : [role]);
  const boardTiles: Tile[] = BOARDS.map((b) => {
    const url = b.build(term, { where, mode });
    return { name: b.name, meta: b.tag, url: entry ? entryLevelize(url) : url };
  });
  const query: HiddenQuery = {
    role,
    roles: many ? active : undefined,
    entry,
    where,
    mode,
    recency,
    contract,
  };
  const tilesFor = (sites: HiddenSite[]): Tile[] =>
    sites.map((a) => ({
      name: a.name,
      meta: a.note ?? a.domain,
      url: a.href ?? atsSearchUrl(a.site, query),
    }));
  const allButton = (sites: HiddenSite[], what: string) => (
    <Box sx={{ mt: 3, mb: 3 }}>
      <Button variant="secondary" size="sm" asChild>
        <a href={searchAllUrl(sites, query)} target="_blank" rel="noopener noreferrer">
          {`Search the top ${searchAllCount(sites, query)} ${what} at once`}
        </a>
      </Button>
    </Box>
  );
  return (
    <Box>
      <Box sx={{ mb: 2.5 }}>
        <Text variant="ui" tone="secondary">
          Search the big boards and companies' hiring systems for your ticked titles
          {entry ? ', entry-level filtered' : ''}. Hiring systems reached through Google draw far
          less competition.
        </Text>
      </Box>
      <ContextCaption categoryId={categoryId} />
      {/* Mobile-first: a column that becomes a row from sm. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { base: 'column', sm: 'row' },
          gap: 3,
          mb: 3,
        }}
      >
        <Box sx={{ display: 'contents', '& input': { minWidth: 180 } }}>
          <HdsInput
            size="sm"
            label="Role / title"
            value={many ? '' : role}
            placeholder={many ? `All selected (${active.length})` : undefined}
            onChange={(e) => {
              setRole(e.target.value);
              setAll(false);
            }}
          />
        </Box>
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
        {active.length > 1 && (
          <Tag active={many} onClick={() => setAll(true)}>
            {`All selected (${active.length})`}
          </Tag>
        )}
        {active.map((r) => (
          <Tag
            key={r}
            active={!many && r === role}
            onClick={() => {
              setRole(r);
              setAll(false);
            }}
          >
            {r}
          </Tag>
        ))}
      </Box>
      <Box sx={{ mb: 'xs' }}>
        <SweepTitlesEditor categoryId={categoryId} seed={titles} />
      </Box>
      <Box sx={{ mt: 4 }}>
        <Text variant="body" as="h3" weight="bold">
          Big job boards
        </Text>
      </Box>
      <TileGrid tiles={boardTiles} cta="Search" />
      <Box sx={{ mt: 4 }}>
        <Text variant="body" as="h3" weight="bold">
          Company hiring systems
        </Text>
      </Box>
      {allButton(ATS, 'hiring systems')}
      <TileGrid tiles={tilesFor(ATS)} cta="Search" />
      <Box sx={{ mt: 6 }}>
        <Text variant="body" as="h3" weight="bold">
          Freelance, startup and remote boards
        </Text>
      </Box>
      <Text variant="caption" tone="secondary">
        Boards with no open feed (Upwork, Contra, Wellfound…), reached through Google instead.
      </Text>
      {allButton(HIDDEN_BOARDS, 'boards')}
      <TileGrid tiles={tilesFor(HIDDEN_BOARDS)} cta="Search" />
    </Box>
  );
}

// The tools row is data-driven: adding a tool is one entry here. Short labels on a phone, full
// names from the HDS `sm` breakpoint up (docs/specs/discover.md, "Tools vs sections").
type ToolKey = 'apply' | 'ats' | 'teams';
// Teams (slug `teams`) is the companies list (CompaniesPanel, #237): watched companies and GitHub
// teams with their open roles, dream companies and "Add a company". It leads and is the default
// where it has something to show; elsewhere it sits after Apply now.
const TOOLS: { key: ToolKey; label: string; short: string }[] = [
  { key: 'teams', label: 'Teams', short: 'Teams' },
  { key: 'apply', label: 'Apply now', short: 'Apply' },
  { key: 'ats', label: 'ATS search', short: 'ATS' },
];
// Live postings and the list checker (Find boards) stopped being tools (#237): they are secondary
// views of the companies list, one link away, and their old slugs still open them. The Titles tool
// became the title filter (#223): `titles` opens Live postings with Calibrate open.
type Secondary = 'live' | 'boards';
const SECONDARY_VIEWS: Record<Secondary, string> = {
  live: 'Live postings',
  boards: 'Check a list of companies',
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
  // The title filter's seed (#223): the track's titles, else its ATS roles. One list per track.
  const titleSeed = cat.titles.length ? cat.titles : cat.atsRoles;
  const wide = useAtLeast('sm');
  const teamSearch = useMemo(
    () => teamSearchFor([...cat.titles, ...cat.atsRoles]),
    [cat.titles, cat.atsRoles],
  );
  const dreams = useDreams(cat.id);
  const search = DISCOVERY_SOURCE_ENABLED.github ? teamSearch : null;
  // The companies list leads where it has something to show: a team search, a watched company or
  // a dream company. A track with none of those opens on Apply now.
  const watchesAny = useMemo(() => boardsFromUrls(boardUrls, Infinity).length > 0, [boardUrls]);
  const companiesLead = !!search || dreams.length > 0 || watchesAny;
  // Apply now first where Teams doesn't lead (a stable sort keeps the rest in order).
  const ordered = companiesLead
    ? TOOLS
    : [...TOOLS].sort((a, b) => Number(b.key === 'apply') - Number(a.key === 'apply'));
  // A track with no sections has no "Apply now" view to show: open on ATS search instead.
  const tools = ordered.filter((t) => sections.length || t.key !== 'apply');
  // The old Titles tool's slug lands on Live postings with Calibrate open (#223); the hash is
  // rewritten so Back skips it.
  const fromTitles = route.sub === 'titles';
  const [calibrate, setCalibrate] = useState(false);
  if (fromTitles && !calibrate) setCalibrate(true);
  useEffect(() => {
    if (fromTitles) navigate({ sub: 'live' }, true);
  }, [fromTitles]);
  const sub = fromTitles ? 'live' : route.sub;
  const secondary = sub === 'live' || sub === 'boards' ? (sub as Secondary) : null;
  // No sub → the default tool; a section id → Apply now on that section.
  const fallback: ToolKey = sections.length ? 'apply' : 'ats';
  const defaultTool: ToolKey = companiesLead ? 'teams' : fallback;
  const tool: ToolKey = secondary
    ? 'teams'
    : ((tools.find((t) => t.key === sub)?.key as ToolKey | undefined) ??
      (!sub ? defaultTool : fallback));
  const section = sections.find((sc) => sc.key === sub) ?? sections[0];
  const toolSub = (v: string) => (v === defaultTool ? null : v);
  // The first section's own slug when Apply now isn't the default (`apply` then names it).
  const sectionSub = (v: string) =>
    v === sections[0].key ? (defaultTool === 'apply' ? null : 'apply') : v;

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
            onChange={(v) => navigate({ sub: toolSub(v) })}
            options={tools.map((t) => ({ value: t.key, label: wide ? t.label : t.short }))}
          />
        </TabsOverflowFade>
        {tool === 'apply' && section && (
          <Stack gap="xs">
            <Text variant="body" as="h3" weight="bold">
              Your sections
            </Text>
            {/* Key the tabs by track so switching tracks resets to the first section. */}
            <HdsTabs
              key={cat.id}
              value={section.key}
              onValueChange={(v) => navigate({ sub: sectionSub(v) })}
            >
              <TabsOverflowFade value={section.key}>
                <TabsList aria-label="Your sections">
                  {sections.map((sc) => (
                    <TabsTrigger key={sc.key} value={sc.key}>
                      {sc.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </TabsOverflowFade>
              <TabsContent value={section.key} style={SECTION_PANEL}>
                <GroupPanel
                  tiles={section.tiles}
                  savedSet={savedSet}
                  onManage={() => setManageOpen(true)}
                />
              </TabsContent>
            </HdsTabs>
          </Stack>
        )}
        {tool === 'ats' && (
          <AtsPanel
            titles={titleSeed}
            initialTitle={seed}
            seniority={cat.seniority}
            categoryId={cat.id}
            onManage={() => setManageOpen(true)}
          />
        )}
        {secondary && (
          <Stack gap="px4">
            <Text variant="ui" as="p">
              <InlineLink
                href={defaultTool === 'teams' ? '#/discover' : '#/discover/teams'}
                externalIcon={false}
              >
                Back to companies
              </InlineLink>
            </Text>
            <Text variant="body" as="h3" weight="bold">
              {SECONDARY_VIEWS[secondary]}
            </Text>
          </Stack>
        )}
        {secondary === 'boards' && (
          <Suspense fallback={null}>
            <FindBoardsPanel key={cat.id} categoryId={cat.id} boardUrls={boardUrls} />
          </Suspense>
        )}
        {tool === 'teams' && !secondary && (
          <Suspense fallback={null}>
            <CompaniesPanel
              key={cat.id}
              categoryId={cat.id}
              boardUrls={boardUrls}
              terms={cat.atsRoles.length ? cat.atsRoles : cat.titles}
              search={search}
            />
          </Suspense>
        )}
        {secondary === 'live' && (
          <Suspense fallback={null}>
            <LiveFeedPanel
              key={cat.id}
              categoryId={cat.id}
              terms={cat.atsRoles.length ? cat.atsRoles : cat.titles}
              sweepSeed={titleSeed}
              boardUrls={boardUrls}
              calibrate={calibrate}
            />
          </Suspense>
        )}
      </Stack>
    </Box>
  );
}
