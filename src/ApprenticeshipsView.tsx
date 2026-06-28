import { useMemo, useState } from 'react';
import { Box, Button, Collapse, Stack, Typography } from '@mui/material';
import TileGrid from './TileGrid';
import { APPRENTICESHIP_GROUPS } from './apprenticeships';
import { useTileTriage } from './tileTriage';
import type { Tile } from './jobsData';

export default function ApprenticeshipsView() {
  const { pinned, dismissed } = useTileTriage();
  const [showAside, setShowAside] = useState(false);

  // Pinned tiles float to the top of their group; set-aside tiles drop out of the groups
  // into the collapsible section below, so what's left is what you still have to comb through.
  const groups = useMemo(() => {
    const pset = new Set(pinned);
    const dset = new Set(dismissed);
    return APPRENTICESHIP_GROUPS.map((g) => ({
      ...g,
      tiles: g.tiles
        .filter((t) => !dset.has(t.url))
        .slice()
        .sort((a, b) => (pset.has(a.url) ? 0 : 1) - (pset.has(b.url) ? 0 : 1)),
    }));
  }, [pinned, dismissed]);

  const asideTiles: Tile[] = useMemo(() => {
    const dset = new Set(dismissed);
    return APPRENTICESHIP_GROUPS.flatMap((g) => g.tiles).filter((t) => dset.has(t.url));
  }, [dismissed]);

  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Spokane-eligible and remote opportunities, current by design. The <strong>search</strong>{' '}
        tiles return only what&rsquo;s actually posted right now; the{' '}
        <strong>program portals</strong> take applications on a rolling basis. Use the{' '}
        <strong>pin</strong> and <strong>set-aside</strong> buttons on each tile to comb through the
        board — pinned tiles float to the top of their group, set-aside tiles drop into the section
        at the bottom.
      </Typography>
      {groups.map((g) =>
        g.tiles.length ? (
          <Box key={g.id}>
            <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', mb: 1 }}>{g.label}</Typography>
            <TileGrid tiles={g.tiles} cta={g.id.includes('search') ? 'Search' : 'Open'} triage />
          </Box>
        ) : null,
      )}
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
