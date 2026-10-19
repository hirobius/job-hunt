// HDS gap (#115): MetricTiles fixes min(n, 4) columns at every width, so four tiles squeeze into
// ~80px columns on a 390px phone. This is the same row as an auto-fit Grid of MetricTile: one row
// at desktop, 2 × 2 on a phone. Filed with the Phase 7 asks (#133); swap back to MetricTiles when it
// wraps on narrow widths.
import type { ReactNode } from 'react';
import { Grid } from '@hirobius/design-system';

export default function MetricTilesAutoFit({ children }: { children: ReactNode }) {
  return (
    <Grid layout="auto-fit" minItemWidth="9rem" gap="tight" align="stretch">
      {children}
    </Grid>
  );
}
