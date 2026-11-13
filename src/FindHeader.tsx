// Find's short header (#544, redesign §5.1; the page bar, 2026-11-12): the page's sr-only h1 and, in
// the Deck only, its place "‹ 1 of 50 ›" at the right of the Find | Apply row (Find controls,
// 2026-11-13; nothing there in List). Find has no More menu since #694: Scan now (signed out) and
// Search profile are the Account menu's, and when the sources were last scanned is Scan details'.
import { Pagination, Stack, Text } from '@hirobius/design-system';
import type { DeckPlace } from './ReviewView';
import { InPageBar } from './PageBar';

export function FindHeader({
  heading = true,
  deckPlace = null,
}: {
  /** The page's h1; false while a selected posting's title is the h1 (at lg). */
  heading?: boolean;
  /** The Deck's place (#545): "‹ 1 of 4 ›" after the caption while the Deck is open (2026-11-12:
   *  HDS Pagination compact, as Apply's pager; arrows off at the ends). */
  deckPlace?: DeckPlace | null;
}) {
  // The page bar (2026-11-12): the Find / Apply nav sits where the title was, so "Find" is the h1
  // for screen readers and focus only (.sr-only); the Deck's place goes at the bar's right.
  return (
    <>
      {heading && (
        <Text as="h1" variant="title" className="sr-only">
          Review
        </Text>
      )}
      {deckPlace && (
        <InPageBar>
          <Stack direction="row" align="center" className="min-w-0 rjb-find-tools">
            <DeckPager place={deckPlace} />
          </Stack>
        </InPageBar>
      )}
    </>
  );
}

/** The Deck's walk, "‹ 1 of 51 ›": the same HDS compact pager as Apply's (ApplyPager). */
function DeckPager({ place }: { place: DeckPlace }) {
  // HDS Pagination draws nothing for one page: the last card still says where it is.
  if (place.count < 2)
    return (
      <Text variant="ui" as="span">
        1 of 1
      </Text>
    );
  return (
    <Pagination
      variant="compact"
      label="Postings in the deck"
      page={place.at + 1}
      count={place.count}
      onPageChange={(p) => place.onAt(p - 1)}
    />
  );
}
