// Suspense fallbacks shaped like the view they stand in for, so the layout doesn't jump
// when the real chunk loads (replaces a centered spinner). All HDS: Skeleton, Card, Grid, Box.
import { Card, Skeleton, Box, Grid } from '@hirobius/design-system';

/** A grid of tile-card placeholders — matches TileGrid (Discover / Apprenticeships). */
export function TileGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <Grid layout="auto-fill" minItemWidth="160px" gap="medium" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} bordered padding="none" style={{ height: '100%' }}>
          <Box sx={{ p: 3 }}>
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="55%" />
            <Skeleton variant="rectangular" height={28} style={{ marginTop: 10 }} />
          </Box>
        </Card>
      ))}
    </Grid>
  );
}

/** Discover: a scrollable tab strip over a tile grid. */
export function DiscoverSkeleton() {
  return (
    <Box aria-busy aria-label="Loading">
      <Box sx={{ display: 'flex', flexDirection: 'row', gap: 'xs', mb: 'sm' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" width={88} height={32} />
        ))}
      </Box>
      <TileGridSkeleton />
    </Box>
  );
}

/** Copy Deck: a toolbar over a stack of snippet cards. */
export function CopyDeckSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Box aria-busy aria-label="Loading">
      <Box sx={{ display: 'flex', flexDirection: 'row', gap: 'xs', mb: 'sm' }}>
        <Skeleton variant="rectangular" width={120} height={32} />
        <Skeleton variant="rectangular" width={120} height={32} style={{ marginLeft: 'auto' }} />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {Array.from({ length: count }).map((_, i) => (
          <Card key={i} bordered padding="none">
            <Box sx={{ p: 'sm' }}>
              <Skeleton variant="text" width="40%" height={28} />
              <Skeleton variant="text" width="90%" />
              <Skeleton variant="text" width="75%" />
            </Box>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
