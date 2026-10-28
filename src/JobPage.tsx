// A saved job's own page (#127, #130): `#/queue/<jobId>`, inside the Pipeline tab. A header
// (badges, title, one next step, menu) over one page (#416: Details, Notes, Documents, Decks).
import { useEffect } from 'react';
import { Box, Skeleton, Stack, Text, Sidebar, useAtLeast } from '@hirobius/design-system';
import { findJobById, useJobs } from './store';
import { titleOf } from './jobRow';
import { usePageTitle } from './pageTitle';
import { goBackTo, openJob, originOf, useRoute } from './route';
import { scrollToTop } from './scrollMemory';
import { useCloudSync } from './account/accountContext';
import JobHeader from './JobHeader';
import JobOverview from './JobOverview';
import JobRail from './JobRail';
import type { Job } from './types';

/** The header over the one page (#416, Adrian's Q5: no tabs). An old `?section=` link opens it
 *  as is. */
function JobDetail({ job, showBack }: { job: Job; showBack: boolean }) {
  return (
    <Box>
      <JobHeader job={job} showBack={showBack} />
      <JobOverview job={job} />
    </Box>
  );
}

function JobPageSkeleton() {
  return (
    <Box aria-busy="true" sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Text variant="ui" as="p" role="status" tone="secondary">
        Looking for this job. It may still be syncing to this device.
      </Text>
      <Stack gap="normal" aria-hidden="true">
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="text" width="35%" />
        <Skeleton variant="rectangular" height={120} />
      </Stack>
    </Box>
  );
}

export default function JobPage({ jobId }: { jobId: string }) {
  const job = findJobById(jobId, useJobs());
  usePageTitle(job ? titleOf(job) : 'Job');
  // An unknown id may just not have synced onto this device yet: wait until sync has settled,
  // then fall back to the page that linked here (else the Pipeline) without a new history entry.
  const { settled } = useCloudSync();
  const route = useRoute();
  const origin = originOf(route);

  useEffect(() => {
    if (job || !settled) return;
    const back = originOf(route);
    if (back) goBackTo(back);
    else openJob(null, true);
    // Only when the job or sync changes: the route is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, settled]);

  // Opening a job from far down the list should start at its top, not at the list's scroll offset
  // (coming back to it restores where it was instead).
  useEffect(() => {
    scrollToTop();
  }, [jobId]);

  // HDS Sidebar only wraps with CSS, so below lg it would stack the list above the job: choose in
  // JS and show the job alone, with a Back link, instead.
  const wide = useAtLeast('lg');

  // Not found yet: it may be about to sync in, so wait quietly. Once sync has settled the effect
  // above has already sent us back to the Pipeline.
  if (!job) return <JobPageSkeleton />;

  // Keyed by job, so every field's draft resets when the job changes. At lg the rail stands in for
  // Back to the Pipeline, but a job opened from elsewhere (Companies, a Company page) shows its Back.
  const detail = <JobDetail key={job.url} job={job} showBack={!wide || !!origin} />;
  if (wide)
    return (
      <Sidebar side="start" sideWidth="22rem" contentMin="50%" gap="normal">
        <JobRail openId={jobId} />
        {detail}
      </Sidebar>
    );
  return <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>{detail}</Box>;
}
