// Find's short header (#544, redesign §5.1): the page's name and one caption, "Scanned 2 h ago", with
// one More menu beside it that holds Sort, Scan now (signed out; Stop scan while it runs)
// and Search profile. The date line, the Sort key on the toolbar and the Scan now key by the list's
// heading are gone. Signed in, "scanned" is the server's last sync (#448); signed out, the last
// scan in this browser. Nothing is said about a time that is not known.
import { useRef, useState } from 'react';
import { Button, Dialog, Icon, Menu, Stack, Text } from '@hirobius/design-system';
import { Ellipsis } from 'lucide-react';
import { MetaCaption } from './MetaCaption';
import { useBackCloses, useBackSheet } from './useBackCloses';
import { SearchProfileDialog, useLoadedWhen } from './lazyDialogs';
import { refocusAccount, useCloudSync } from './account/accountContext';
import { cancelScan, scanNow, useScan } from './feed/autoScan';
import { useScanInput } from './feed/useAutoScan';
import { agoPhrase, useServerUpdatedAt } from './feed/serverUpdated';
import { SORT_LABEL, type FeedSort } from './feed/feed';
import { findCaption } from './findCaption';

const SORTS: FeedSort[] = ['newest', 'score', 'company'];

export interface FindSort {
  value: FeedSort;
  onChange: (s: FeedSort) => void;
}

export function FindHeader({
  heading = true,
  sort = null,
  deckPlace = null,
}: {
  /** The page's h1; false while a selected posting's title is the h1 (at lg). */
  heading?: boolean;
  /** Browse's sort, when there is a list to sort. */
  sort?: FindSort | null;
  /** The Deck's place, "1 of 4" (#545), at the end of the caption while the Deck is open. */
  deckPlace?: string | null;
}) {
  const { user } = useCloudSync();
  const { state, running } = useScan();
  const server = useServerUpdatedAt(!!user);
  const scanned = user ? agoPhrase(server.at, server.now) : agoPhrase(state.finishedAt);
  return (
    <Stack direction="row" gap="tight" align="start" justify="space-between">
      <Stack gap="px4" className="min-w-0">
        <Text as={heading ? 'h1' : 'p'} variant="title">
          Find
        </Text>
        <MetaCaption items={[...findCaption(scanned, !user && running), deckPlace]} />
      </Stack>
      <FindMore sort={sort} signedIn={!!user} running={running} />
    </Stack>
  );
}

function FindMore({
  sort,
  signedIn,
  running,
}: {
  sort: FindSort | null;
  signedIn: boolean;
  running: boolean;
}) {
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
            label="More: sort, scan and search profile"
          />
        </Menu.Trigger>
        <Menu.Content align="end">
          {sort && (
            <>
              <Menu.Label>Sort</Menu.Label>
              <Menu.RadioGroup
                value={sort.value}
                onValueChange={(v) => sort.onChange(v as FeedSort)}
              >
                {SORTS.map((s) => (
                  <Menu.RadioItem key={s} value={s}>
                    {SORT_LABEL[s]}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
              <Menu.Separator />
            </>
          )}
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
