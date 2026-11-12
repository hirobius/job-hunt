// Find (was Today), the home page and one of the two top tabs (#471 slice 3, Adrian 2026-11-05).
// Two columns at lg: the list column (Daily picks when signed in, the auto-scan's status, Review new
// as the Browse list, then the companies the scan found: Follow / Ignore) and the selected posting
// (`#/find/<fingerprint>`; "Pick a posting" until one is picked). Below lg the list is the tab and a
// picked posting is its own view with Back and a pager. Follow up and Apply moved to the Apply tab,
// so each thing shows on one tab only. ReviewView lays the columns out; this gives it the parts.
import { Skeleton, Stack, Text } from '@hirobius/design-system';
import { Panel, PanelBody } from './PipelinePanel';
import { MetaCaption } from './MetaCaption';
import { NewCompanies, ScanStatus } from './AutoScanViews';
import ReviewView from './ReviewView';
import DailyPicks from './DailyPicks';
import { useProfile } from './profile';
import { useCloudSync } from './account/accountContext';

export default function Today() {
  const profile = useProfile();
  const { offline, user } = useCloudSync();
  const now = new Date();
  const header = (
    <Stack gap="px4">
      <Text as="h1" variant="title">
        Find
      </Text>
      <MetaCaption
        items={[
          now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
        ]}
      />
    </Stack>
  );
  // The scheduled run's hand-picked roles (picks.ts), signed in only: fit line, draft note (Copy),
  // Save → Apply. Hidden when there are none.
  const picks = user ? <DailyPicks key={user.id} /> : null;
  if (profile)
    return (
      // The scan's status, then every design-system posting, newest first, as a list (the Deck is a
      // toggle inside). Review new hosts the status, so its counts are the Feed's own.
      <ReviewView
        label="Review"
        scanStatus
        header={header}
        before={picks}
        after={<NewCompanies />}
      />
    );
  // The design-systems profile is made on its own once sync settles (searchDefaults.ts
  // `ensureProfile`); until then Review new holds its place, or says why it can't.
  return (
    <Stack gap="px24">
      {header}
      {picks}
      <Stack gap="normal">
        <Panel label="Review" title="Review" trailing={<ScanStatus />} flat>
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
      <NewCompanies />
    </Stack>
  );
}
