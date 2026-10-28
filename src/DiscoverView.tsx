import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Copy, ExternalLink, Link, ListPlus, Plus, Search } from 'lucide-react';
import {
  Button,
  Icon,
  Select,
  Switcher,
  SegmentedControl,
  Badge,
  Card,
  Tag,
  Box,
  Text,
  Disclosure,
  Stack,
  VisuallyHidden,
  useToast,
  useAtLeast,
} from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import TileGrid from './TileGrid';
import { useRoute, navigate, parseHash } from './route';
import BackLink from './BackLink';
import { useBackCloses } from './useBackCloses';
import type { Back } from './back';
import {
  boardsFor,
  ATS,
  HIDDEN_BOARDS,
  atsSearchUrl,
  entryLevelize,
  searchAllCount,
  searchAllUrl,
  fitQuery,
  titleClause,
  type HiddenQuery,
  type HiddenSite,
  type Tile,
} from './jobsData';
import { useJobs } from './store';
import { partitionTiles } from './tileState';
import { splitTileName } from './tileMeta';
import { useTileTriage } from './tileTriage';
import { seedFor } from './discoverSeed';
import { useRemembered } from './viewMemory';
import { useCategories, useGroups, useTiles, addCategory } from './curation/curationStore';
import { seedPack } from './curation/starterPacks';
import type { Category, Seniority } from './curation/types';
import DiscoverHeader from './DiscoverHeader';
import { contextLabel, placeLabel, useTrackContext } from './discoverContext';
import { Panel, PanelBody, PanelRow, PanelRows } from './PipelinePanel';
import { DISCOVERY_SOURCE_ENABLED } from './feed/discoverySources';
import { companySourceFor } from './feed/companySource';
import { WATCH_GROUP_LABEL, boardUrlsFor } from './feed/watchlist';
import { useActiveTitles } from './feed/sweepTitles';
import { activeAtsRoles, useMustInclude } from './feed/mustInclude';
import { useDreams } from './feed/dreams';
import { boardsFromUrls } from './feed/sources/ats';
import { displayGroupLabel } from './curation/groupLabel';
import { ACTIVE_CATEGORY_KEY, loadActiveCategory } from './activeTrack';
import { importFresh } from './staleBuild';

const ManageTrackDialog = lazy(importFresh(() => import('./ManageTrackDialog')));
const LiveFeedPanel = lazy(importFresh(() => import('./LiveFeedPanel')));
const ReviewView = lazy(importFresh(() => import('./ReviewView')));
const FindBoardsPanel = lazy(importFresh(() => import('./FindBoardsPanel')));
const CompaniesPanel = lazy(importFresh(() => import('./CompaniesPanel')));

// Discover reads the per-account CURATION STORE (categories→groups→tiles), not the old hardcoded
// pillars (B1 / #30). A Category IS a track: its titles/atsRoles/seniority/location drive the
// generated Title & ATS searches; its groups→tiles are the curated "Apply Now"/section content.
// An empty store routes to first-run Onboarding (decision D1), gated by the shell (#128).

/** Hiring-system rows shown before "Show N more" (rev-3 mock: three quiet rows). */
const ATS_SHOWN = 3;
// About four mono lines at phone width: a longer query is clamped with a "Show full query" toggle.
const QUERY_CLAMP_CHARS = 160;

/** A closed section's preview line: its links' titles, once each (the row clamps it to a line). */
const sectionPreview = (tiles: Tile[]): string =>
  tiles.length === 0
    ? 'No links yet'
    : [...new Set(tiles.map((t) => splitTileName(t.name, t.url).title))].join(', ');

// Curated group tiles: saved ones removed (issue #57), pin/set-aside triage kept (decision D2).
function GroupPanel({
  tiles,
  savedSet,
  onManage,
  place,
}: {
  tiles: Tile[];
  savedSet: ReadonlySet<string>;
  onManage: () => void;
  /** The track's place, the tiles' fallback place fact. */
  place: string;
}) {
  const triage = useTileTriage();
  const { visible, saved, aside } = partitionTiles(tiles, triage, savedSet);
  return (
    <Box>
      {saved.length > 0 && (
        <Box sx={{ mb: 'xs' }}>
          <Text variant="caption" as="div" tone="secondary">
            {saved.length} saved to your Pipeline
          </Text>
        </Box>
      )}
      {visible.length > 0 ? (
        <TileGrid tiles={visible} triage place={place} />
      ) : saved.length > 0 ? (
        <EmptyState
          centered
          icon={Link}
          title="All saved to your Pipeline"
          action={
            <Button variant="secondary" onClick={() => navigate({ tab: 'queue' })}>
              Open Pipeline
            </Button>
          }
        />
      ) : (
        <EmptyState
          centered
          icon={Link}
          title="No links here yet"
          description="Add links you trust, or use ATS search for live ones."
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
            <TileGrid tiles={aside} triage place={place} />
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
  remember,
  onManage,
}: {
  /** The track's titles: the title filter's list until edited (#213, #223). */
  titles: string[];
  seniority: Seniority;
  categoryId: string;
  /** A title "Find more like this" seeded (#57). */
  initialTitle?: string | null;
  /** Where its picks are kept for this page load (per track and origin, return paths). */
  remember: string;
  onManage: () => void;
}) {
  const { where, mode } = useTrackContext(categoryId);
  const active = useActiveTitles(categoryId, titles);
  // Kept for this page load, so the search comes back as it was left (return paths).
  const [picked, setRole] = useRemembered(`${remember}:role`, initialTitle || active[0] || '');
  // A picked title unticked since (in Calibrate) is no longer searched: the first ticked one is.
  // A seeded title stays, though it is not on the list.
  const role = picked === initialTitle || active.includes(picked) ? picked : (active[0] ?? picked);
  const [all, setAll] = useRemembered(`${remember}:all`, !initialTitle);
  const many = all && active.length > 1;
  const [recency, setRecency] = useRemembered<'' | 'w' | 'm'>(`${remember}:recency`, '');
  const [contract, setContract] = useRemembered(`${remember}:contract`, false);
  const [showAll, setShowAll] = useRemembered(`${remember}:showAll`, false);
  const [showAllAts, setShowAllAts] = useRemembered(`${remember}:showAllAts`, false);
  const [fullQuery, setFullQuery] = useState(false);
  if (titles.length === 0)
    return (
      <EmptyState
        centered
        icon={ListPlus}
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
  const boardTiles: Tile[] = boardsFor(mode).map((b) => {
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
  // One Google query has a 32-word cap: with many titles ticked, keep the first ones that leave
  // room for at least three hiring systems, so "Search all boards" never searches none.
  const fit = fitQuery(ATS, query, 3);
  const fitTitles = fit.roles?.length ?? 1;
  const atsTiles = tilesFor(ATS);
  const allUrl = searchAllUrl(ATS, fit);
  const allQuery = new URL(allUrl).searchParams.get('q') ?? '';
  // Four titles, then "N more" (rev-3 I): the chips wrap, All selected first.
  const shownTitles = showAll ? active : active.slice(0, 4);
  return (
    <Stack gap="spacious">
      <Panel
        label="Search hiring systems"
        title="Search hiring systems"
        description={`Reads your ticked titles${entry ? ', entry-level filtered' : ''}. Searching ${contextLabel(where, mode)}.`}
      >
        <PanelBody>
          <Stack gap="normal">
            <Stack direction="row" wrap="wrap" gap="px8" align="center">
              {active.length > 1 && (
                <Tag active={many} onClick={() => setAll(true)}>
                  {`All selected (${active.length})`}
                </Tag>
              )}
              {shownTitles.map((r) => (
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
              {/* One way into the list: "N more" opens the chip row in place (the ticks are
                  edited in Live postings' Calibrate). */}
              {active.length > 4 && (
                <Tag onClick={() => setShowAll(!showAll)}>
                  {!showAll && <Icon icon={Plus} size="small" />}
                  {showAll ? 'Fewer' : `${active.length - 4} more`}
                </Tag>
              )}
            </Stack>
            {/* Both filters on one row. */}
            <Switcher gap="tight" threshold="16rem">
              <Select
                label="Recency"
                showLabel={false}
                value={recency || 'any'}
                onChange={(v) => setRecency(v === 'any' ? '' : (v as 'w' | 'm'))}
                options={[
                  { value: 'any', label: 'Any time' },
                  { value: 'w', label: 'Past week' },
                  { value: 'm', label: 'Past month' },
                ]}
              />
              <Select
                label="Engagement"
                showLabel={false}
                value={contract ? 'contract' : 'any'}
                onChange={(v) => setContract(v === 'contract')}
                options={[
                  { value: 'any', label: 'Any role' },
                  { value: 'contract', label: 'Contract only' },
                ]}
              />
            </Switcher>
            <Box sx={{ display: 'flex', '& > *': { flex: '1 1 0%' } }}>
              <Button variant="primary" size="md" asChild>
                <a href={allUrl} target="_blank" rel="noopener noreferrer">
                  <Icon icon={Search} />
                  Search all boards
                </a>
              </Button>
            </Box>
            <Text variant="caption" as="p" tone="secondary">
              {`Results open in Google: no hiring system has a search across companies, so this is one Google query over the top ${searchAllCount(ATS, fit)}${many && fitTitles < active.length ? `, with your first ${fitTitles} titles` : ''}.`}
            </Text>
            {/* The query gets the card's full width under its Copy (a phone fits ~4 mono lines
                beside nothing else); breaks fall on spaces and ORs, four lines until opened. */}
            <Card padding="px16">
              <Stack gap="px8">
                <Stack direction="row" gap="px8" align="center" justify="space-between">
                  <Text variant="caption" as="span" tone="secondary">
                    Google query
                  </Text>
                  <CopyQuery text={allQuery} />
                </Stack>
                <Text
                  variant="mono"
                  as="p"
                  className={fullQuery ? 'rjb-query' : 'rjb-query rjb-clamp-4'}
                >
                  {allQuery}
                </Text>
                {allQuery.length > QUERY_CLAMP_CHARS && (
                  <Box>
                    <Button
                      variant="tertiary"
                      size="sm"
                      className="rjb-quiet rjb-back-link"
                      onClick={() => setFullQuery(!fullQuery)}
                    >
                      {fullQuery ? 'Show less' : 'Show full query'}
                    </Button>
                  </Box>
                )}
              </Stack>
            </Card>
          </Stack>
        </PanelBody>
      </Panel>
      {/* Three quiet rows, the rest one tap away (rev-3 mock): the one-query search above is the
          way in, these are for one system at a time. */}
      <Stack gap="px8">
        <Text variant="body" as="h3" weight="bold">
          Company hiring systems
        </Text>
        <LinkRows tiles={showAllAts ? atsTiles : atsTiles.slice(0, ATS_SHOWN)} />
        {atsTiles.length > ATS_SHOWN && (
          <Box>
            <Button variant="tertiary" size="sm" onClick={() => setShowAllAts(!showAllAts)}>
              {showAllAts ? 'Show fewer' : `Show ${atsTiles.length - ATS_SHOWN} more`}
            </Button>
          </Box>
        )}
      </Stack>
      <Stack gap="px8">
        <BoardSection
          label="Big job boards"
          count={boardTiles.length}
          preview="LinkedIn, Indeed and more, with your titles and place"
        >
          <LinkRows tiles={boardTiles} bare />
        </BoardSection>
        <BoardSection
          label="Freelance, startup and remote boards"
          count={HIDDEN_BOARDS.length}
          preview="Upwork, Contra, Wellfound… through Google"
        >
          <Stack gap="xs">
            <Text variant="caption" as="p" tone="secondary">
              Boards with no open feed, reached through Google instead.
            </Text>
            <Box>
              <Button variant="secondary" size="md" asChild>
                <a
                  href={searchAllUrl(HIDDEN_BOARDS, fit)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {`Search the top ${searchAllCount(HIDDEN_BOARDS, fit)} boards at once`}
                </a>
              </Button>
            </Box>
            <LinkRows tiles={tilesFor(HIDDEN_BOARDS)} bare />
          </Stack>
        </BoardSection>
      </Stack>
    </Stack>
  );
}

/** Copy the generated query: the icon turns to a check and a toast says so (#212), or says it
 *  couldn't. */
function CopyQuery({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const failed = () =>
    toast({
      title: "Couldn't copy",
      description: 'Select the query and copy it yourself.',
      tone: 'danger',
    });
  return (
    <Button
      size="md"
      variant="tertiary"
      iconOnly
      iconLeft={<Icon icon={copied ? Check : Copy} />}
      label={copied ? 'Copied the query' : 'Copy the query'}
      onClick={() => {
        if (!navigator.clipboard) return failed();
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          toast({ title: 'Copied the query', tone: 'success' });
        }, failed);
      }}
    />
  );
}

/** A closed row with its name, a count badge and a one-line preview, opening downward (rev-3
 *  mock: ATS search's board lists, Apply now's other sections). The row's text starts on the
 *  PanelRow inset (md), so it lines up with the link rows beside it. */
function SectionRow({
  label,
  count,
  countLabel,
  preview,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  count: number;
  countLabel: string;
  preview: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Card padding="none" className="rjb-disclosure-vertical rjb-disclosure-wrap">
      <Box sx={{ px: 'md' }}>
        <Disclosure
          variant="row"
          label={
            // The badge stays beside the name: the name wraps (never cut, round-2 review at
            // 390), the badge never wraps alone. A Box, not Stack: the label sits in a grid
            // cell, so the row needs min-width 0.
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 'xs', minWidth: 0 }}>
              <Box
                as="span"
                className="rjb-semibold"
                sx={{ display: 'block', minWidth: 0, overflowWrap: 'anywhere' }}
              >
                {label}
              </Box>
              <Badge count={count} label={countLabel} />
            </Box>
          }
          preview={preview}
          {...(open !== undefined ? { open } : {})}
          {...(onOpenChange ? { onOpenChange } : {})}
        >
          {children}
        </Disclosure>
      </Box>
    </Card>
  );
}

/** A closed list of board links (rev-3 mock): one row with the name and a count, opened in place. */
function BoardSection({
  label,
  count,
  preview,
  children,
}: {
  label: string;
  count: number;
  preview: string;
  children: ReactNode;
}) {
  return (
    <SectionRow label={label} count={count} countLabel={`${count} boards`} preview={preview}>
      {children}
    </SectionRow>
  );
}

/** Search links as flat rows (rev-3 I): the name, its site or note, and a quiet Search with an
 *  external-link icon. `bare`: no card of its own (inside a BoardSection). */
function LinkRows({ tiles, bare = false }: { tiles: Tile[]; bare?: boolean }) {
  const rows = (
    <PanelRows>
      {tiles.map((t) => (
        <PanelRow key={t.url + t.name}>
          <Box as="article" aria-label={t.name}>
            <Stack direction="row" gap="tight" align="center" justify="space-between">
              <Box sx={{ minWidth: 0 }}>
                <Text variant="ui" as="p" className="rjb-semibold">
                  {t.name}
                </Text>
                {t.meta && (
                  <Text variant="caption" as="p" tone="secondary" className="rjb-truncate">
                    {t.meta}
                  </Text>
                )}
              </Box>
              <Button variant="tertiary" size="sm" asChild>
                <a href={t.url} target="_blank" rel="noopener noreferrer">
                  Search
                  <Icon icon={ExternalLink} size="small" />
                </a>
              </Button>
            </Stack>
          </Box>
        </PanelRow>
      ))}
    </PanelRows>
  );
  return bare ? (
    rows
  ) : (
    <Card padding="none">
      {/* The card draws the only outline: no row hairline on its rounded top edge. */}
      <Box sx={{ '& > ul > li:first-of-type': { borderTop: 0 } }}>{rows}</Box>
    </Card>
  );
}

type ToolKey = 'apply' | 'ats' | 'teams';
// Watched (slug `teams`, kept for old links) is the companies list (CompaniesPanel, #237): watched
// companies and GitHub teams with their open roles, dream companies and "Add a company". It leads
// and is the default where it has something to show; elsewhere it sits after Apply now. The label
// is rev-3 G's "Watched"; the slug stays `teams`.
const TOOLS: { key: ToolKey; label: string }[] = [
  { key: 'teams', label: 'Watched' },
  { key: 'apply', label: 'Apply now' },
  { key: 'ats', label: 'ATS search' },
];
// Live postings and the list checker (Find boards) stopped being tools (#237): they are secondary
// views of the companies list, one link away, and their old slugs still open them. The Titles tool
// became the title filter (#223): `titles` opens Live postings with Calibrate open.
type Secondary = 'live' | 'boards' | 'review';
const SECONDARY_VIEWS: Record<Secondary, string> = {
  live: 'Live postings',
  boards: 'Check a list of companies',
  review: 'Review new',
};

const COMPANIES = parseHash('#/discover');
// "Back to companies" keeps its words; a recorded origin is named instead.
const toCompanies = (b: Back) => (b.recorded ? b.label : 'Back to companies');
const toCompaniesName = (b: Back) => (b.recorded ? `Back to ${b.label}` : null);

export default function DiscoverView() {
  const categories = useCategories();
  // No tracks → the shell shows onboarding instead of this view (App.tsx, #128).
  if (categories.length === 0) return null;
  return <DiscoverInner categories={categories} />;
}

function DiscoverInner({ categories }: { categories: Category[] }) {
  const allGroups = useGroups();
  const allTiles = useTiles();
  const jobs = useJobs();
  const savedSet = useMemo(() => new Set(jobs.map((j) => j.url)), [jobs]);
  const [activeId, setActiveId] = useState(() => loadActiveCategory(categories));
  const [manageOpen, setManageOpen] = useState(false);
  // The browser's Back closes Manage track and stays on Companies (return paths).
  useBackCloses(manageOpen, () => setManageOpen(false), 'manage-track');

  const cat = categories.find((c) => c.id === activeId) ?? categories[0];
  const trackContext = useTrackContext(cat.id);
  const trackPlace = placeLabel(trackContext.where, trackContext.mode);
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
    ...(featured
      ? [
          {
            key: featured.id,
            label: displayGroupLabel(featured.label, { featured: true }),
            tiles: tilesFor(featured.id),
          },
        ]
      : []),
    ...rest.map((g) => ({ key: g.id, label: displayGroupLabel(g.label), tiles: tilesFor(g.id) })),
  ];

  const route = useRoute();
  // Find more like this: the title it handed over stays with the search opened from that job (its
  // `?from=`), so coming back to it shows the same title (return paths).
  const seed = useMemo(() => seedFor(route.from ?? null), [route.from]);
  // The title filter's seed (#223): the track's titles, else its ATS roles. One list per track.
  const titleSeed = cat.titles.length ? cat.titles : cat.atsRoles;
  // The track's search terms: its ATS roles that are on (the systems-only move switches some off,
  // feed/mustInclude.ts), else its titles. Must include filters every list of postings below.
  const mustInclude = useMustInclude(cat.id);
  const atsOn = useMemo(
    () => activeAtsRoles(cat.atsRoles, mustInclude),
    [cat.atsRoles, mustInclude],
  );
  // Unticked titles never feed a search (2026-10-23): the fallback is the ticked ones.
  const tickedTitles = useActiveTitles(cat.id, titleSeed);
  const searchTerms = atsOn.length ? atsOn : tickedTitles;
  // The track's company source (#215): GitHub where its terms name a topic, else its starter list
  // and the YC companies hiring now. Never design-system teams on a track that isn't one.
  const companySource = useMemo(
    () =>
      companySourceFor(
        { label: cat.label, titles: cat.titles, atsRoles: cat.atsRoles },
        DISCOVERY_SOURCE_ENABLED,
      ),
    [cat.label, cat.titles, cat.atsRoles],
  );
  const dreams = useDreams(cat.id);
  const search = companySource.kind === 'github' ? companySource.search : null;
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
  const roomyTools = useAtLeast('sm');
  const secondary =
    sub === 'live' || sub === 'boards' || sub === 'review' ? (sub as Secondary) : null;
  // No sub → the default tool; a section id → Apply now on that section.
  const fallback: ToolKey = sections.length ? 'apply' : 'ats';
  const defaultTool: ToolKey = companiesLead ? 'teams' : fallback;
  const tool: ToolKey = secondary
    ? 'teams'
    : ((tools.find((t) => t.key === sub)?.key as ToolKey | undefined) ??
      (!sub ? defaultTool : fallback));
  const section = sections.find((sc) => sc.key === sub) ?? sections[0];
  const toolSub = (v: string) => (v === defaultTool ? null : v);
  // A view opened from elsewhere (Find more like this from a job) keeps that origin as the tools
  // and sections change, so its Back still goes there (return paths).
  const from = route.from ?? null;
  // The first section's own slug when Apply now isn't the default (`apply` then names it).
  const sectionSub = (v: string) =>
    v === sections[0].key ? (defaultTool === 'apply' ? null : 'apply') : v;

  return (
    <Box>
      {/* Opened by a key action elsewhere (Find more like this): "← <that job>" at the top of the
          page, like every Back (return paths). */}
      {from && !secondary && (
        <Box sx={{ mb: 'xs' }}>
          <BackLink fallback={COMPANIES} fallbackLabel="Companies" />
        </Box>
      )}
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
        {/* Full names (rev-3 G), full width on a phone and as wide as its labels from sm up (a
            1052px strip of three words read as a progress bar, Adrian 2026-10-22). The tools are
            the second and last nav level. A
            secondary view (Live postings, the list checker) is not one of them, so it swaps the
            switch for "Back to companies" instead of stacking a third level under a segment that
            names another page. */}
        {!secondary && (
          <SegmentedControl
            aria-label="Search tool"
            size="sm"
            fullWidth={!roomyTools}
            value={tool}
            onChange={(v) => navigate({ sub: toolSub(v), from })}
            options={tools.map((t) => ({ value: t.key, label: t.label }))}
          />
        )}
        {tool === 'apply' && section && (
          // The track's sections stack (rev-3 G: no third tab row). The routed one is open under
          // its heading; the rest are closed rows, and opening one routes to it.
          <Box as="section" aria-label="Your sections">
            <Stack gap="normal">
              {sections.map((sc) =>
                sc.key === section.key ? (
                  <Stack key={sc.key} gap="xs">
                    <Stack direction="row" gap="px8" align="center">
                      <Text variant="body" as="h3" weight="bold">
                        {sc.label}
                      </Text>
                      <Badge count={sc.tiles.length} label={`${sc.tiles.length} links`} />
                    </Stack>
                    <GroupPanel
                      tiles={sc.tiles}
                      place={trackPlace}
                      savedSet={savedSet}
                      onManage={() => setManageOpen(true)}
                    />
                  </Stack>
                ) : (
                  <SectionRow
                    key={sc.key}
                    label={sc.label}
                    count={sc.tiles.length}
                    countLabel={`${sc.tiles.length} links`}
                    preview={sectionPreview(sc.tiles)}
                    open={false}
                    onOpenChange={(o) => o && navigate({ sub: sectionSub(sc.key), from })}
                  >
                    {null}
                  </SectionRow>
                ),
              )}
            </Stack>
          </Box>
        )}
        {tool === 'ats' && (
          <AtsPanel
            key={`${cat.id}|${from ?? ''}|${seed ?? ''}`}
            remember={`ats:${cat.id}:${from ?? ''}:${seed ?? ''}`}
            titles={titleSeed}
            initialTitle={seed}
            seniority={cat.seniority}
            categoryId={cat.id}
            onManage={() => setManageOpen(true)}
          />
        )}
        {secondary && (
          <Stack gap="px4">
            {/* "← Back to companies", the job page's Back pattern (rev-3), with no leading
                padding so the arrow lines up with the heading (`.rjb-back-link`). */}
            {/* A pop when the list is just behind, so it comes back at the scroll it had (the
                More ways panel), and the browser's Back doesn't bounce (return paths). */}
            <BackLink
              fallback={parseHash(defaultTool === 'teams' ? '#/discover' : '#/discover/teams')}
              sameAs={defaultTool === 'teams' ? [parseHash('#/discover/teams')] : []}
              fallbackLabel="companies"
              text={toCompanies}
              ariaLabel={toCompaniesName}
            />
            {/* Live postings goes straight from Back to the search row (rev-3 mock): its name
                stays in the outline for assistive tech only. Check a list of companies names
                itself in its panel's header (rev-3 L). */}
            {secondary === 'live' ? (
              <VisuallyHidden>
                <h3>{SECONDARY_VIEWS[secondary]}</h3>
              </VisuallyHidden>
            ) : (
              secondary !== 'boards' && (
                <Text variant="body" as="h3" className="rjb-semibold">
                  {SECONDARY_VIEWS[secondary]}
                </Text>
              )
            )}
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
              terms={searchTerms}
              source={companySource}
            />
          </Suspense>
        )}
        {secondary === 'review' && (
          <Suspense fallback={null}>
            <ReviewView key={cat.id} categoryId={cat.id} />
          </Suspense>
        )}
        {secondary === 'live' && (
          <Suspense fallback={null}>
            <LiveFeedPanel
              key={cat.id}
              categoryId={cat.id}
              terms={searchTerms}
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
