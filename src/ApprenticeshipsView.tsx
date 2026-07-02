import { useMemo, useState } from 'react';
import {
  Box,
  Collapse,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { IconButton as HdsIconButton, Tag } from '@hirobius/design-system';
import { Button } from './ui/Button';
import { Search, X, ChevronDown } from 'lucide-react';
import TileGrid from './TileGrid';
import EmptyState from './EmptyState';
import { APPRENTICESHIP_GROUPS } from './apprenticeships';
import { useTileTriage } from './tileTriage';
import { partitionTiles } from './tileState';
import { useUserTiles, addUserTilesFromText, removeUserTile } from './userTiles';
import type { Group, Tile } from './jobsData';

// Collapsed group ids persist so the board opens the way you left it.
const COLLAPSE_KEY = 'rjb_appr_collapsed';
const loadCollapsed = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const saveCollapsed = (ids: string[]) => {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
};

// Jump-chip label: the group label minus its parenthetical qualifier.
const jumpLabel = (label: string) => label.replace(/\s*\(.*\)\s*$/, '');

export default function ApprenticeshipsView() {
  const triage = useTileTriage();
  const userTiles = useUserTiles();
  const [showAside, setShowAside] = useState(false);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<string[]>(loadCollapsed);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const addTiles = () => {
    if (!draft.trim()) return;
    addUserTilesFromText(draft);
    setDraft('');
  };

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveCollapsed(next);
      return next;
    });
  };
  const setAllCollapsed = (ids: string[]) => {
    setCollapsed(ids);
    saveCollapsed(ids);
  };

  // Your pasted tiles come first, then the curated groups.
  const allGroups: Group[] = useMemo(
    () => [{ id: 'my', label: 'My apprenticeships', tiles: userTiles }, ...APPRENTICESHIP_GROUPS],
    [userTiles],
  );

  // Pinned tiles float to the top of their group; set-aside tiles drop out into the collapsible
  // section below. A live query then narrows every group by tile name + meta.
  const groups = useMemo(() => {
    const match = (t: Tile) =>
      !q || t.name.toLowerCase().includes(q) || t.meta.toLowerCase().includes(q);
    return allGroups.map((g) => ({
      ...g,
      tiles: partitionTiles(g.tiles, triage).visible.filter(match),
    }));
  }, [allGroups, triage, q]);

  const matchCount = useMemo(
    () => (searching ? groups.reduce((n, g) => n + g.tiles.length, 0) : 0),
    [groups, searching],
  );

  const asideTiles: Tile[] = useMemo(
    () => partitionTiles(allGroups.flatMap((g) => g.tiles), triage).aside,
    [allGroups, triage],
  );

  const collapsibleIds = allGroups.filter((g) => g.id !== 'my').map((g) => g.id);
  const allAreCollapsed = collapsibleIds.every((id) => collapsed.includes(id));

  const jumpTo = (id: string) => {
    // Expand first so there's something to land on, then scroll on the next frame.
    setCollapsed((prev) => {
      const next = prev.filter((x) => x !== id);
      saveCollapsed(next);
      return next;
    });
    requestAnimationFrame(() =>
      document.getElementById(`grp-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Spokane-eligible and remote opportunities, current by design. The <strong>search</strong>{' '}
        tiles return only what&rsquo;s posted right now; the <strong>program portals</strong> take
        applications on a rolling basis. Use the <strong>pin</strong> and <strong>set-aside</strong>{' '}
        buttons to comb through the board, or paste your own links into{' '}
        <strong>My apprenticeships</strong> to track them alongside the curated ones.
      </Typography>

      {/* Sticky board search — filters every group by tile name + details. */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          bgcolor: 'background.default',
          py: 1,
        }}
      >
        <TextField
          size="small"
          fullWidth
          placeholder="Search the board — name, trade, pay, city, phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Search apprenticeships board' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={16} />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <HdsIconButton
                    size="sm"
                    variant="tertiary"
                    icon={X}
                    onClick={() => setQuery('')}
                    label="Clear search"
                  />
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        {searching && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {matchCount} {matchCount === 1 ? 'match' : 'matches'}
          </Typography>
        )}
      </Box>

      {/* Jump chips + collapse-all — orientation for a long board. Hidden while searching. */}
      {!searching && (
        <Box
          sx={{
            display: 'flex',
            gap: 0.75,
            overflowX: 'auto',
            pb: 0.5,
            alignItems: 'center',
            '& > *': { flex: 'none' },
          }}
        >
          <Button
            size="small"
            style={{ flex: 'none', whiteSpace: 'nowrap' }}
            onClick={() => setAllCollapsed(allAreCollapsed ? [] : collapsibleIds)}
          >
            {allAreCollapsed ? 'Expand all' : 'Collapse all'}
          </Button>
          {allGroups.map(
            (g) =>
              g.id !== 'my' && (
                <Tag key={g.id} onClick={() => jumpTo(g.id)}>
                  {jumpLabel(g.label)}
                </Tag>
              ),
          )}
        </Box>
      )}

      {groups.map((g) => {
        const isMy = g.id === 'my';
        if (!isMy && !g.tiles.length) return null;
        const isOpen = isMy || searching || !collapsed.includes(g.id);
        return (
          <Box key={g.id} id={`grp-${g.id}`} sx={{ scrollMarginTop: 64 }}>
            <Stack direction="row" alignItems="center" spacing={0.25} sx={{ mb: 1 }}>
              {!isMy && (
                <HdsIconButton
                  size="sm"
                  variant="tertiary"
                  icon={ChevronDown}
                  onClick={() => toggleGroup(g.id)}
                  aria-expanded={isOpen}
                  label={`${isOpen ? 'Collapse' : 'Expand'} ${g.label}`}
                  style={{
                    marginLeft: -6,
                    transform: isOpen ? 'none' : 'rotate(-90deg)',
                    transition: 'transform 0.15s',
                  }}
                />
              )}
              <Typography
                onClick={isMy ? undefined : () => toggleGroup(g.id)}
                sx={{
                  fontWeight: 600,
                  fontSize: '1.05rem',
                  cursor: isMy ? 'default' : 'pointer',
                  userSelect: 'none',
                }}
              >
                {g.label}
              </Typography>
              {!isMy && (
                <Typography variant="caption" color="text.secondary" sx={{ pl: 0.5 }}>
                  ({g.tiles.length})
                </Typography>
              )}
            </Stack>
            {isMy && (
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ mb: g.tiles.length ? 1.5 : 1 }}
              >
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Paste an apprenticeship link (or several)…"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTiles();
                    }
                  }}
                />
                <Button
                  variant="contained"
                  onClick={addTiles}
                  disabled={!draft.trim()}
                  sx={{ flex: 'none' }}
                >
                  Add
                </Button>
              </Stack>
            )}
            {g.tiles.length > 0 && (
              <Collapse in={isOpen}>
                <TileGrid
                  tiles={g.tiles}
                  cta={g.id.includes('search') ? 'Search' : 'Open'}
                  triage
                  onRemove={isMy ? removeUserTile : undefined}
                />
              </Collapse>
            )}
            {isMy && !g.tiles.length && !searching && (
              <EmptyState
                dense
                message="Nothing here yet — paste any apprenticeship or job link above and it’ll show up here to pin, set aside, or save."
              />
            )}
          </Box>
        );
      })}

      {searching && matchCount === 0 && (
        <EmptyState
          dense
          message={`No tiles match “${query.trim()}”. Try a shorter word — shop name, trade, or city.`}
        />
      )}

      {asideTiles.length > 0 && !searching && (
        <Box>
          <Button size="small" onClick={() => setShowAside((v) => !v)} style={{ marginBottom: 8 }}>
            {showAside ? 'Hide' : 'Show'} set aside ({asideTiles.length})
          </Button>
          <Collapse in={showAside}>
            <TileGrid tiles={asideTiles} cta="Open" triage />
          </Collapse>
        </Box>
      )}
    </Stack>
  );
}
