import { useMemo, useState } from 'react';
import { Box, Button, Collapse, Stack, TextField, Typography } from '@mui/material';
import TileGrid from './TileGrid';
import EmptyState from './EmptyState';
import { APPRENTICESHIP_GROUPS } from './apprenticeships';
import { useTileTriage } from './tileTriage';
import { useUserTiles, addUserTilesFromText, removeUserTile } from './userTiles';
import type { Group, Tile } from './jobsData';

export default function ApprenticeshipsView() {
  const { pinned, dismissed } = useTileTriage();
  const userTiles = useUserTiles();
  const [showAside, setShowAside] = useState(false);
  const [draft, setDraft] = useState('');

  const addTiles = () => {
    if (!draft.trim()) return;
    addUserTilesFromText(draft);
    setDraft('');
  };

  // Your pasted tiles come first, then the curated groups.
  const allGroups: Group[] = useMemo(
    () => [{ id: 'my', label: 'My apprenticeships', tiles: userTiles }, ...APPRENTICESHIP_GROUPS],
    [userTiles],
  );

  // Pinned tiles float to the top of their group; set-aside tiles drop out into the collapsible
  // section below, so what's left is what you still have to comb through.
  const groups = useMemo(() => {
    const pset = new Set(pinned);
    const dset = new Set(dismissed);
    return allGroups.map((g) => ({
      ...g,
      tiles: g.tiles
        .filter((t) => !dset.has(t.url))
        .slice()
        .sort((a, b) => (pset.has(a.url) ? 0 : 1) - (pset.has(b.url) ? 0 : 1)),
    }));
  }, [allGroups, pinned, dismissed]);

  const asideTiles: Tile[] = useMemo(() => {
    const dset = new Set(dismissed);
    return allGroups.flatMap((g) => g.tiles).filter((t) => dset.has(t.url));
  }, [allGroups, dismissed]);

  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Spokane-eligible and remote opportunities, current by design. The <strong>search</strong>{' '}
        tiles return only what&rsquo;s posted right now; the <strong>program portals</strong> take
        applications on a rolling basis. Use the <strong>pin</strong> and <strong>set-aside</strong>{' '}
        buttons to comb through the board, or paste your own links into{' '}
        <strong>My apprenticeships</strong> to track them alongside the curated ones.
      </Typography>
      {groups.map((g) => {
        const isMy = g.id === 'my';
        if (!isMy && !g.tiles.length) return null;
        return (
          <Box key={g.id}>
            <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', mb: 1 }}>{g.label}</Typography>
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
              <TileGrid
                tiles={g.tiles}
                cta={g.id.includes('search') ? 'Search' : 'Open'}
                triage
                onRemove={isMy ? removeUserTile : undefined}
              />
            )}
            {isMy && !g.tiles.length && (
              <EmptyState
                dense
                message="Nothing here yet — paste any apprenticeship or job link above and it’ll show up here to pin, set aside, or save."
              />
            )}
          </Box>
        );
      })}
      {asideTiles.length > 0 && (
        <Box>
          <Button size="small" onClick={() => setShowAside((v) => !v)} sx={{ mb: 1 }}>
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
