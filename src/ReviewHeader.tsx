// Review's short header (#544, redesign §5.1; the page bar, 2026-11-12): the page's sr-only h1. The
// Review / Apply nav sits where the title was, so "Review" is the h1 for screen readers and focus only.
// Review has no More menu since #694, and no pager in the page bar since the Deck went (Adrian
// 2026-11-13): below lg the list's own pager row sits above the list.
import { Text } from '@hirobius/design-system';

export function ReviewHeader({
  heading = true,
}: {
  /** The page's h1; false while a selected posting's title is the h1 (at lg). */
  heading?: boolean;
}) {
  return heading ? (
    <Text as="h1" variant="title" className="sr-only">
      Review
    </Text>
  ) : null;
}
