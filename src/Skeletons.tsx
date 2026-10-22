// Suspense fallbacks shaped like the view they stand in for, so the layout doesn't jump
// when the real chunk loads (replaces a centered spinner). All HDS: Skeleton, Stack, Box.
// Calm list (#241): both views are flat rows on the page, so the placeholders are too (no cards).
import { Skeleton, Box, Stack } from '@hirobius/design-system';

/** Flat row placeholders split by hairlines, like the Companies and Templates lists. */
function RowsSkeleton({ count }: { count: number }) {
  return (
    <Box aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <Box key={i} sx={{ py: 'sm', borderBottom: 'thin solid', borderColor: 'border.default' }}>
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

/** The Pipeline (and the job pages under its tab): the page title, a panel head, then rows. */
export function PipelineSkeleton() {
  return (
    <Box aria-busy aria-label="Loading">
      <Stack gap="normal">
        <Skeleton variant="text" width="25%" height={32} />
        <Skeleton variant="rectangular" width="100%" height={88} />
        <RowsSkeleton count={4} />
      </Stack>
    </Box>
  );
}
