// Suspense fallbacks shaped like the view they stand in for, so the layout doesn't jump
// when the real chunk loads (replaces a centered spinner). HDS Skeleton/Card; MUI only
// for the Box/Stack layout primitives (last sweep, issue #11).
import { Box, Stack } from './ui/box';
import { Card, Skeleton } from '@hirobius/design-system';

const gridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: 1.25,
} as const;

/** A grid of tile-card placeholders — matches TileGrid (Discover / Apprenticeships). */
export function TileGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <Box sx={gridSx} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} bordered padding="none" style={{ height: '100%' }}>
          <Box sx={{ p: 1.5 }}>
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="55%" />
            <Skeleton variant="rectangular" height={28} style={{ marginTop: 10 }} />
          </Box>
        </Card>
      ))}
    </Box>
  );
}

/** Discover: a scrollable tab strip over a tile grid. */
export function DiscoverSkeleton() {
  return (
    <Box aria-busy aria-label="Loading">
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" width={88} height={32} />
        ))}
      </Stack>
      <TileGridSkeleton />
    </Box>
  );
}

/** Copy Deck: a toolbar over a stack of snippet cards. */
export function CopyDeckSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Box aria-busy aria-label="Loading">
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Skeleton variant="rectangular" width={120} height={32} />
        <Skeleton variant="rectangular" width={120} height={32} style={{ marginLeft: 'auto' }} />
      </Stack>
      <Stack spacing={1.5}>
        {Array.from({ length: count }).map((_, i) => (
          <Card key={i} bordered padding="none">
            <Box sx={{ p: 2 }}>
              <Skeleton variant="text" width="40%" height={28} />
              <Skeleton variant="text" width="90%" />
              <Skeleton variant="text" width="75%" />
            </Box>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
