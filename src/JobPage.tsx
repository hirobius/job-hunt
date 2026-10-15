// A saved job's own page (#127, #130): `#/queue/<jobId>`, inside the Pipeline tab. A header
// (title, status, one next step, menu) over the job's sections.
import { useEffect } from 'react';
import { Box, Stack } from '@hirobius/design-system';
import { findJobById, useJobs } from './store';
import { openJob } from './route';
import { useCloudSync } from './account/accountContext';
import EmptyState from './EmptyState';
import JobHeader from './JobHeader';
import JobOverview from './JobOverview';
import JobCard from './JobCard';

export default function JobPage({ jobId }: { jobId: string }) {
  const job = findJobById(jobId, useJobs());
  // An unknown id may just not have synced onto this device yet: wait until sync has settled,
  // then fall back to the Pipeline without a new history entry.
  const { settled } = useCloudSync();

  useEffect(() => {
    if (!job && settled) openJob(null, true);
  }, [job, settled]);

  // Opening a job from far down the list should start at its top, not at the list's scroll offset.
  useEffect(() => {
    window.scrollTo?.({ top: 0 });
  }, [jobId]);

  if (!job)
    return <EmptyState title="Job not found" message="It may still be syncing to this device." />;

  // Sections 3 to 5 (screening, contacts, to-dos) still live in the card until the tabs land.
  return (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <JobHeader job={job} />
      <Stack gap="normal">
        <JobOverview key={job.url} job={job} />
        <JobCard job={job} />
      </Stack>
    </Box>
  );
}
