// Find's short header (#544, redesign §5.1; the page bar, 2026-11-12): the page's sr-only h1. The
// Find / Apply nav sits where the title was, so "Find" is the h1 for screen readers and focus only.
// Find has no More menu since #694, and no pager in the page bar since the Deck went (Adrian
// 2026-11-13): below lg the list's own pager row sits above the list.
import { Text } from '@hirobius/design-system';

export function FindHeader({
  heading = true,
}: {
  /** The page's h1; false while a selected posting's title is the h1 (at lg). */
  heading?: boolean;
}) {
  return heading ? (
    <Text as="h1" variant="title" className="sr-only">
      Find
    </Text>
  ) : null;
}
