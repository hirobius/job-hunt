// Suspense fallbacks shaped like the view they stand in for, so the layout doesn't jump
// when the real chunk loads (replaces a centered spinner). Pure presentational MUI.
import { Box, Card, CardContent, Skeleton, Stack } from '@mui/material';

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
        <Card key={i} variant="outlined" sx={{ height: '100%' }}>
          <CardContent sx={{ p: 1.5 }}>
            <Skeleton variant="text" width="80%" />
            <Skeleton variant="text" width="55%" />
            <Skeleton variant="rounded" height={28} sx={{ mt: 1.25 }} />
          </CardContent>
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
          <Skeleton key={i} variant="rounded" width={88} height={32} />
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
        <Skeleton variant="rounded" width={120} height={32} />
        <Skeleton variant="rounded" width={120} height={32} sx={{ ml: 'auto' }} />
      </Stack>
      <Stack spacing={1.5}>
        {Array.from({ length: count }).map((_, i) => (
          <Card key={i} variant="outlined">
            <CardContent>
              <Skeleton variant="text" width="40%" height={28} />
              <Skeleton variant="text" width="90%" />
              <Skeleton variant="text" width="75%" />
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}

/** Case study: a long-form article placeholder. */
export function CaseStudySkeleton() {
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', py: { xs: 3, sm: 6 }, px: 2 }} aria-busy aria-label="Loading">
      <Skeleton variant="text" width={120} sx={{ mb: 3 }} />
      <Skeleton variant="text" width="70%" height={48} />
      <Skeleton variant="text" width="50%" height={48} sx={{ mb: 3 }} />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} variant="text" width={i % 3 === 2 ? '60%' : '100%'} />
      ))}
    </Box>
  );
}
