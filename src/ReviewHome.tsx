// Review (was Find, and before that Today), the home page and one of the two top tabs (#471 slice 3,
// Adrian 2026-11-05; renamed Review 2026-11-13).
// Two columns at lg: the list column (Daily picks when signed in, the auto-scan's status, Review new
// as the Browse list; the companies the scan found are the Companies dialog's Found list since
// #618) and the selected posting
// (`#/review/<fingerprint>`; the first posting when the tab opens, #546). Below lg the list is the tab and a
// picked posting is its own view with Back and a pager. Follow up and Apply moved to the Apply tab,
// so each thing shows on one tab only. ReviewView lays the columns out; this gives it the parts.
import { useEffect } from 'react';
import { Button, Skeleton, Stack, Text } from '@hirobius/design-system';
import { LogIn } from 'lucide-react';
import { EmptyState } from './hds-gaps/EmptyState';
import { firstSignInAsk } from './signInAsked';
import { startDemo, useDemo } from './demo/demoMode';
import { useJobs } from './store';
import { useRoute } from './route';
import { hasPersistedSession } from './supabase';
import { Panel, PanelBody } from './PipelinePanel';
import { ReviewHeader } from './ReviewHeader';
import ReviewView, { DemoReviewList } from './ReviewView';
import DailyPicks from './DailyPicks';
import { useProfile } from './profile';
import { useCloudSync } from './account/accountContext';

/** Signed out, Review reads nothing (#755, Adrian 2026-11-15): no feed, board, description or
 *  postings read and no scan. One line and one filled key, Sign in, under the sign-in screen;
 *  with no jobs on this device, the grey Try a demo (Adrian 2026-11-16) starts the demo (#835):
 *  fictional postings here and the sample jobs on Apply, with no account and no scan. */
export function SignedOutReview() {
  const { authResolved, setSignInOpen } = useCloudSync();
  const noJobs = useJobs().length === 0;
  // A dialog the link opened (Documents, Privacy and terms) is what the visitor came for: no
  // screen over it.
  const route = useRoute();
  const overDialog = (route.documents !== null && route.documents !== undefined) || !!route.legal;
  // A demo link (#835) is on its way to the demo: no sign-in screen over it.
  const demoLink = !!route.demo;
  useEffect(() => {
    // A stored session is on its way in (its user lands a moment after `authResolved`): no screen.
    if (!authResolved || overDialog || demoLink || hasPersistedSession()) return;
    if (firstSignInAsk()) setSignInOpen(true);
  }, [authResolved, overDialog, demoLink, setSignInOpen]);
  return (
    <Stack gap="px24">
      <ReviewHeader />
      {authResolved ? (
        <EmptyState
          onPage
          icon={LogIn}
          title="Sign in to see new postings."
          action={
            <Stack direction="row" gap="px8" justify="center" wrap="wrap">
              <Button variant="primary" onClick={() => setSignInOpen(true)}>
                Sign in
              </Button>
              {noJobs && (
                <Button variant="secondary" onClick={() => void startDemo()}>
                  Try a demo
                </Button>
              )}
            </Stack>
          }
        />
      ) : (
        <Stack gap="tight">
          <Skeleton variant="text" width="70%" />
          <Skeleton variant="text" width="40%" />
        </Stack>
      )}
    </Stack>
  );
}

export default function ReviewHome() {
  const profile = useProfile();
  const { offline, user } = useCloudSync();
  const demo = useDemo();
  // The demo (#835): signed out, fictional postings under a note; nothing is read.
  if (!user && demo)
    return (
      <Stack gap="px24">
        <ReviewHeader />
        <DemoReviewList />
      </Stack>
    );
  // Signed out (or not known yet), nothing on Review reads postings (#755).
  if (!user) return <SignedOutReview />;
  // The scheduled run's hand-picked roles (picks.ts), signed in only: fit line, draft note (Copy),
  // Save → Apply. Hidden when there are none.
  const picks = user ? <DailyPicks key={user.id} /> : null;
  if (profile)
    return (
      // The short header (#544: "Find", "Scanned 2 h ago", one More menu), then every
      // design-system posting, newest first, as a list (list only since 2026-11-13). Review hosts
      // the header, so its count is the Feed's own.
      <ReviewView
        label="New postings"
        scanStatus
        header={({ selected }) => <ReviewHeader heading={!selected} />}
        before={picks}
      />
    );
  // The design-systems profile is made on its own once sync settles (searchDefaults.ts
  // `ensureProfile`); until then Review new holds its place, or says why it can't.
  return (
    <Stack gap="px24">
      <ReviewHeader />
      {picks}
      <Stack gap="normal">
        <Panel label="New postings" title="New postings" titleHidden flat>
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
