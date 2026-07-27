import { useMemo, useState } from 'react';
import { Box, Stack, Typography } from './ui/box';
import { Button, IconButton as HdsIconButton, Input as HdsInput } from '@hirobius/design-system';
import { Reveal } from './ui/Reveal';
import { Search, ChevronDown, Archive } from 'lucide-react';
import TileGrid from './TileGrid';
import EmptyState from './EmptyState';
import { APPRENTICESHIP_GROUPS, VISIBLE_GROUP_ORDER } from './apprenticeships';
import { useTileTriage } from './tileTriage';
import { useJobs } from './store';
import { partitionTiles } from './tileState';
import { useUserTiles, addUserTilesFromText, removeUserTile } from './userTiles';
import type { Group, Tile } from './jobsData';

// Expanded group ids persist so the board opens the way you left it. The board defaults to
// COLLAPSED (no ids stored → every section closed): it opens as a short, scannable list of
// section headers with counts, and you tap the ones you want. This keeps the long board from
// feeling endless — the headers ARE the navigation, so the old jump-chip row is gone.
const EXPAND_KEY = 'rjb_appr_expanded';
const loadExpanded = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(EXPAND_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const saveExpanded = (ids: string[]) => {
  try {
    localStorage.setItem(EXPAND_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
};

// Sort the live groups so hands-on metal leads; anything unlisted falls to the end.
const orderRank = (id: string) => {
  const i = (VISIBLE_GROUP_ORDER as readonly string[]).indexOf(id);
  return i === -1 ? VISIBLE_GROUP_ORDER.length : i;
};

export default function ApprenticeshipsView() {
  const triage = useTileTriage();
  const userTiles = useUserTiles();
  const jobs = useJobs();
  const savedSet = useMemo(() => new Set(jobs.map((j) => j.url)), [jobs]);
  const [showAside, setShowAside] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>(loadExpanded);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const addTiles = () => {
    if (!draft.trim()) return;
    addUserTilesFromText(draft);
    setDraft('');
  };

  const toggleGroup = (id: string) => {
    setExpanded((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveExpanded(next);
      return next;
    });
  };
  const setAllExpanded = (ids: string[]) => {
    setExpanded(ids);
    saveExpanded(ids);
  };

  // My pasted tiles first, then the curated live groups (hands-on order); archived groups
  // are kept separate and stashed under their own disclosure below.
  const liveCurated = useMemo(
    () =>
      APPRENTICESHIP_GROUPS.filter((g) => !g.archived).sort(
        (a, b) => orderRank(a.id) - orderRank(b.id),
      ),
    [],
  );
  const archivedCurated = useMemo(() => APPRENTICESHIP_GROUPS.filter((g) => g.archived), []);

  const liveGroups: Group[] = useMemo(
    () => [{ id: 'my', label: 'My apprenticeships', tiles: userTiles }, ...liveCurated],
    [userTiles, liveCurated],
  );

  // Pinned tiles float to the top of their group; set-aside tiles drop out into the collapsible
  // section below. A live query then narrows every group by tile name + meta.
  const groups = useMemo(() => {
    const match = (t: Tile) =>
      !q || t.name.toLowerCase().includes(q) || t.meta.toLowerCase().includes(q);
    return liveGroups.map((g) => {
      const part = partitionTiles(g.tiles, triage, savedSet);
      return { ...g, tiles: part.visible.filter(match), savedCount: part.saved.length };
    });
  }, [liveGroups, triage, savedSet, q]);
  const archivedGroups = useMemo(() => {
    const match = (t: Tile) =>
      !q || t.name.toLowerCase().includes(q) || t.meta.toLowerCase().includes(q);
    return archivedCurated.map((g) => {
      const part = partitionTiles(g.tiles, triage, savedSet);
      return { ...g, tiles: part.visible.filter(match), savedCount: part.saved.length };
    });
  }, [archivedCurated, triage, savedSet, q]);

  // Search spans the whole board — live + archived — so nothing hides behind the disclosure.
  const matchCount = useMemo(
    () => (searching ? [...groups, ...archivedGroups].reduce((n, g) => n + g.tiles.length, 0) : 0),
    [groups, archivedGroups, searching],
  );
  const archivedMatchCount = useMemo(
    () => (searching ? archivedGroups.reduce((n, g) => n + g.tiles.length, 0) : 0),
    [archivedGroups, searching],
  );

  const asideTiles: Tile[] = useMemo(
    () =>
      partitionTiles(
        [...liveGroups, ...archivedCurated].flatMap((g) => g.tiles),
        triage,
      ).aside,
    [liveGroups, archivedCurated, triage],
  );

  const collapsibleIds = liveCurated.map((g) => g.id);
  const allAreExpanded =
    collapsibleIds.length > 0 && collapsibleIds.every((id) => expanded.includes(id));

  // One group block, shared by the live board and the archived disclosure.
  const renderGroup = (g: Group & { savedCount?: number }) => {
    const isMy = g.id === 'my';
    if (!isMy && !g.tiles.length && !searching) return null;
    if (!isMy && !g.tiles.length && searching) return null;
    const isOpen = isMy || searching || expanded.includes(g.id);
    return (
      <Box key={g.id} id={`grp-${g.id}`} sx={{ scrollMarginTop: 72 }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{ mb: 1, cursor: isMy ? 'default' : 'pointer' }}
          onClick={isMy ? undefined : () => toggleGroup(g.id)}
        >
          {!isMy && (
            <HdsIconButton
              size="sm"
              variant="tertiary"
              icon={ChevronDown}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                toggleGroup(g.id);
              }}
              aria-expanded={isOpen}
              label={`${isOpen ? 'Collapse' : 'Expand'} ${g.label}`}
              style={{
                marginLeft: -6,
                flex: 'none',
                transform: isOpen ? 'none' : 'rotate(-90deg)',
                transition: 'transform 0.15s',
              }}
            />
          )}
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: { xs: '1rem', sm: '1.05rem' },
              lineHeight: 1.3,
              userSelect: 'none',
              minWidth: 0,
            }}
          >
            {g.label}
          </Typography>
          {!isMy && (
            <Typography variant="caption" color="text.secondary" sx={{ pl: 0.25, flex: 'none' }}>
              ({g.tiles.length})
            </Typography>
          )}
          {!isMy && g.savedCount ? (
            <Typography variant="caption" color="text.secondary" sx={{ pl: 0.5, flex: 'none' }}>
              · {g.savedCount} in Queue
            </Typography>
          ) : null}
        </Stack>
        {isMy && (
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ mb: g.tiles.length ? 1.5 : 1 }}
          >
            <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
              <HdsInput
                size="sm"
                aria-label="Paste apprenticeship links"
                placeholder="Paste an apprenticeship link (or several)…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTiles();
                  }
                }}
                style={{ width: '100%' }}
              />
            </Box>
            <Button
              variant="primary"
              onClick={addTiles}
              disabled={!draft.trim()}
              sx={{ flex: 'none' }}
            >
              Add
            </Button>
          </Stack>
        )}
        {g.tiles.length > 0 && (
          <Reveal open={isOpen}>
            <TileGrid
              tiles={g.tiles}
              cta={g.id.includes('search') ? 'Search' : 'Open'}
              triage
              onRemove={isMy ? removeUserTile : undefined}
            />
          </Reveal>
        )}
        {isMy && !g.tiles.length && !searching && (
          <EmptyState
            dense
            message="Nothing here yet — paste any apprenticeship or job link above and it’ll show up here to pin, set aside, or save."
          />
        )}
      </Box>
    );
  };

  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Spokane-eligible, hands-on trades — sheet metal, welding, fabrication, foundry and concrete
        lead. <strong>Search</strong> tiles return only what&rsquo;s posted right now;{' '}
        <strong>program portals</strong> take applications on a rolling basis.{' '}
        <strong>Saving</strong> a tile adds it to your Queue. Healthcare, remote and other tracks
        are stashed under <strong>Archived</strong> at the bottom.
      </Typography>

      {/* Sticky board search — filters every group (live + archived) by name + details. */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.default', py: 1 }}>
        <HdsInput
          size="sm"
          aria-label="Search apprenticeships board"
          placeholder="Search the board — name, trade, pay, city, phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          leadingVisual={<Search size={16} />}
          className="w-full"
          style={{ width: '100%' }}
        />
        {searching && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {matchCount} {matchCount === 1 ? 'match' : 'matches'}
          </Typography>
        )}
      </Box>

      {/* One expand/collapse-all control. The board opens collapsed — a short list of section
          headers with counts — so the old horizontally-scrolling jump-chip row (which just
          duplicated those headers) is gone. Hidden while searching (everything auto-expands). */}
      {!searching && collapsibleIds.length > 0 && (
        <Box>
          <Button
            variant="tertiary"
            size="sm"
            style={{ whiteSpace: 'nowrap' }}
            onClick={() => setAllExpanded(allAreExpanded ? [] : collapsibleIds)}
          >
            {allAreExpanded ? 'Collapse all' : 'Expand all'}
          </Button>
        </Box>
      )}

      {groups.map(renderGroup)}

      {searching && matchCount === 0 && (
        <EmptyState
          dense
          message={`No tiles match “${query.trim()}”. Try a shorter word — shop name, trade, or city.`}
        />
      )}

      {/* Archived — healthcare, remote programs, AI/expert work, SaaS pipelines. Kept for
          reference, out of the hands-on flow. Auto-revealed while searching if it has hits. */}
      {archivedGroups.length > 0 && (!searching || archivedMatchCount > 0) && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2.5 }}>
          <Button
            variant="tertiary"
            iconLeft={<Archive size={16} />}
            onClick={() => setShowArchived((v) => !v)}
            style={{ marginBottom: showArchived || searching ? 12 : 0 }}
          >
            {showArchived || searching ? 'Hide' : 'Show'} archived tracks
            {searching ? ` (${archivedMatchCount})` : ' — healthcare, remote & AI'}
          </Button>
          <Reveal open={showArchived || searching}>
            <Stack spacing={3} sx={{ mt: 1 }}>
              {archivedGroups.map(renderGroup)}
            </Stack>
          </Reveal>
        </Box>
      )}

      {asideTiles.length > 0 && !searching && (
        <Box>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setShowAside((v) => !v)}
            style={{ marginBottom: 8 }}
          >
            {showAside ? 'Hide' : 'Show'} set aside ({asideTiles.length})
          </Button>
          <Reveal open={showAside}>
            <TileGrid tiles={asideTiles} cta="Open" triage />
          </Reveal>
        </Box>
      )}
    </Stack>
  );
}
