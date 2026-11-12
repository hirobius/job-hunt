// Find (was Today), the home page and one of the two top tabs (#471 slice 3, Adrian 2026-11-05).
// Two columns at lg: the list column (Daily picks when signed in, the auto-scan's status, Review new
// as the Browse list; the companies the scan found are the Companies dialog's Found list since
// #618) and the selected posting
// (`#/find/<fingerprint>`; the first posting when the tab opens, #546). Below lg the list is the tab and a
// picked posting is its own view with Back and a pager. Follow up and Apply moved to the Apply tab,
// so each thing shows on one tab only. ReviewView lays the columns out; this gives it the parts.
import { Skeleton, Stack, Text } from '@hirobius/design-system';
import { Panel, PanelBody } from './PipelinePanel';
import { FindHeader } from './FindHeader';
import ReviewView from './ReviewView';
import DailyPicks from './DailyPicks';
import { useProfile } from './profile';
import { useCloudSync } from './account/accountContext';

export default function Today() {
  const profile = useProfile();
  const { offline, user } = useCloudSync();
  // The scheduled run's hand-picked roles (picks.ts), signed in only: fit line, draft note (Copy),
  // Save → Apply. Hidden when there are none.
  const picks = user ? <DailyPicks key={user.id} /> : null;
  if (profile)
    return (
      // The short header (#544: "Find", "4 new · scanned 2 h ago", one More menu), then every
      // design-system posting, newest first, as a list (the Deck is a toggle inside). Review hosts
      // the header, so its count is the Feed's own.
      <ReviewView
        label="Review"
        scanStatus
        header={({ newCount, sort, selected, deckPlace }) => (
          <FindHeader heading={!selected} newCount={newCount} sort={sort} deckPlace={deckPlace} />
        )}
        before={picks}
      />
    );
  // The design-systems profile is made on its own once sync settles (searchDefaults.ts
  // `ensureProfile`); until then Review new holds its place, or says why it can't.
  return (
    <Stack gap="px24">
      <FindHeader />
      {picks}
      <Stack gap="normal">
        <Panel label="Review" title="Review" flat>
          <PanelBody>
            {offline ? (
              <Text variant="caption" as="p" tone="secondary">
                Couldn&apos;t reach your account. Your search loads once you&apos;re back online.
              </Text>
            ) : (
              <Stack gap="tight">
                <Skeleton variant="text" width="70%" />
                <Skeleton variant="text" width="40%" />
              </Stack>
            )}
          </PanelBody>
        </Panel>
      </Stack>
    </Stack>
  );
}
