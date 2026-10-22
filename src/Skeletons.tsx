// Suspense fallbacks shaped like the view they stand in for, so the layout doesn't jump
// when the real chunk loads (replaces a centered spinner). All HDS: Skeleton, Stack, Box.
// Roomy layout: both views are filled cards on the canvas, so the placeholders are too (no rules).
import { Skeleton, Box, Stack } from '@hirobius/design-system';

/** Card placeholders, like the Companies and Documents lists: filled, set apart by space. */
function RowsSkeleton({ count }: { count: number }) {
  return (
    <Box
      aria-hidden
      sx={{ display: 'flex', flexDirection: 'column', gap: { base: 'sm', sm: 'md' } }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          sx={{ bgcolor: 'surface.raised', borderRadius: 'lg', p: { base: 'sm', sm: 'md' } }}
        >
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="text" width="70%" />
        </Box>
      ))}
    </Box>
  );
}

/** Companies: the page title, a tool strip, then rows. */
export function DiscoverSkeleton() {
  return (
    <Box aria-busy aria-label="Loading">
      <Stack gap="normal">
        <Skeleton variant="text" width="35%" height={32} />
        <Stack direction="row" gap="xs">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" width={88} height={32} />
          ))}
        </Stack>
        <RowsSkeleton count={6} />
      </Stack>
    </Box>
  );
}

/** Templates: the page title, a search field, then rows. */
export function CopyDeckSkeleton({ count = 3 }: { count?: number }) {
  return (
    <Box aria-busy aria-label="Loading">
      <Stack gap="normal">
        <Skeleton variant="text" width="30%" height={32} />
        <Skeleton variant="rectangular" width={240} height={32} />
        <RowsSkeleton count={count} />
      </Stack>
    </Box>
  );
}
