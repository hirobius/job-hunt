// Find's short header (#544, redesign §5.1; the page bar, 2026-11-12): the page's sr-only h1 and one caption, "Scanned 2 h ago", with
// one More menu beside it that holds Scan now (signed out; Stop scan while it runs) and Search
// profile. Sort is its own key in the Review row (2026-11-12, FindSortMenu). The date line and the
// Scan now key by the list's heading are gone. Signed in, "scanned" is the server's last sync (#448); signed out, the last
// scan in this browser. Nothing is said about a time that is not known.
import { useRef, useState } from 'react';
import { Button, Dialog, Icon, Menu, Pagination, Stack, Text } from '@hirobius/design-system';
import { Ellipsis } from 'lucide-react';
import { MetaCaption } from './MetaCaption';
import { useBackCloses, useBackSheet } from './useBackCloses';
import { SearchProfileDialog, useLoadedWhen } from './lazyDialogs';
import { refocusAccount, useCloudSync } from './account/accountContext';
import { cancelScan, scanNow, useScan } from './feed/autoScan';
import { useScanInput } from './feed/useAutoScan';
import { agoPhrase, useServerUpdatedAt } from './feed/serverUpdated';
import type { FeedSort } from './feed/feed';
import type { DeckPlace } from './ReviewView';
import { findCaption } from './findCaption';
import { InPageBar } from './PageBar';

export interface FindSort {
  value: FeedSort;
  onChange: (s: FeedSort) => void;
}

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
  const { user } = useCloudSync();
  const { state, running } = useScan();
  const server = useServerUpdatedAt(!!user);
  const scanned = user ? agoPhrase(server.at, server.now) : agoPhrase(state.finishedAt);
  // The page bar (2026-11-12): the Find / Apply nav sits where the title was, so "Find" is the h1
  // for screen readers and focus only (.sr-only); the caption and More go at the bar's right.
  return (
    <>
      {heading && (
        <Text as="h1" variant="title" className="sr-only">
          Find
        </Text>
      )}
      <InPageBar>
        <Stack direction="row" gap="tight" align="center" className="min-w-0 rjb-find-tools">
          <MetaCaption items={findCaption(scanned, !user && running)} />
          {deckPlace && <DeckPager place={deckPlace} />}
          <FindMore signedIn={!!user} running={running} />
        </Stack>
      </InPageBar>
    </>
  );
}

function FindMore({ signedIn, running }: { signedIn: boolean; running: boolean }) {
  const input = useScanInput();
  const trigger = useRef<HTMLButtonElement | null>(null);
  const sheet = useBackSheet('find-more');
  // The Search profile, as the Account menu opens it (lazy, Back closes it).
  const [profile, setProfile] = useState(false);
  useBackCloses(profile, () => setProfile(false), 'find-search-profile');
  const profileReady = useLoadedWhen(SearchProfileDialog, profile, () => setProfile(false));
  return (
    <>
      <Menu
        modal={false}
        {...sheet}
        onOpenChange={(next) => {
          // Fetch the dialog's chunk as the menu opens, so the item answers within 300 ms (#212).
          if (next) SearchProfileDialog.preload().catch(() => {});
          sheet.onOpenChange(next);
        }}
      >
        <Menu.Trigger asChild>
          <Button
            ref={trigger}
            variant="tertiary"
            iconOnly
            iconLeft={<Icon icon={Ellipsis} />}
            label="More: scan and search profile"
          />
        </Menu.Trigger>
        <Menu.Content align="end">
          {/* Signed in the server syncs every 15 minutes; signed out nothing scans on its own. */}
          {!signedIn &&
            (running ? (
              <Menu.Item onSelect={cancelScan}>Stop scan</Menu.Item>
            ) : (
              <Menu.Item onSelect={() => void scanNow(input, undefined, { force: true })}>
                Scan now
              </Menu.Item>
            ))}
          <Menu.Item onSelect={() => setProfile(true)}>Search profile</Menu.Item>
        </Menu.Content>
      </Menu>
      <Dialog open={profile && profileReady} onOpenChange={setProfile}>
        {profile && profileReady && (
          <SearchProfileDialog
            onDone={() => setProfile(false)}
            onCloseAutoFocus={() => refocusAccount(trigger.current)()}
          />
        )}
      </Dialog>
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
