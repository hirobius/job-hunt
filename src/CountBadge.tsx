// One count pill for the top tabs and Find's New / Remote chips: an HDS count Badge capped at "99+"
// (#548's rule), so a big number never widens the row. The full count stays in the control's
// accessible name (the caller's aria-label or link text).
import { Badge } from '@hirobius/design-system';

export const COUNT_MAX = 99;

export function CountBadge({ count, className }: { count: number; className?: string }) {
  return <Badge count={count} max={COUNT_MAX} className={className} />;
}
