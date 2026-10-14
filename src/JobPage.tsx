// A saved job's own page (#127): `#/queue/<jobId>`, inside the Pipeline tab. For now it is the
// job's card with Details open under a page header and a way back; Phase 4 (#130) turns it into
// the two-pane / full-page detail with sections.
import { useEffect } from 'react';
import { Button, Icon } from '@hirobius/design-system';
import { PageHeader } from '@hirobius/design-system/patterns';
import { ArrowLeft } from 'lucide-react';
import { findJobById, prettyTitle, useJobs } from './store';
import { navigate } from './route';
import { useCloudSync } from './account/accountContext';
import EmptyState from './EmptyState';
import JobCard from './JobCard';

const toPipeline = (replace = false) => navigate({ tab: 'queue', jobId: null }, replace);

/** Sync statuses that end in "…" (Syncing…, Refreshing…, Saving…) are still in flight. */
const inFlight = (status: string) => status.endsWith('…');

export default function JobPage({ jobId }: { jobId: string }) {
  const job = findJobById(jobId, useJobs());
  const { authResolved, user, status } = useCloudSync();
  // An unknown id may just not have synced onto this device yet: wait until the session is known
  // and any pull has settled, then fall back to the Pipeline without a new history entry.
  const settled = authResolved && (!user || !inFlight(status));

  useEffect(() => {
    if (!job && settled) toPipeline(true);
  }, [job, settled]);

  // Opening a job from far down the list should start at its top, not at the list's scroll offset.
  useEffect(() => {
    window.scrollTo?.({ top: 0 });
  }, [jobId]);

  const back = (
    <Button
      variant="tertiary"
      size="sm"
      iconLeft={<Icon icon={ArrowLeft} />}
      onClick={() => toPipeline()}
    >
      Back to Pipeline
    </Button>
  );

  if (!job)
    return <EmptyState title="Job not found" message="It may still be syncing to this device." />;

  return (
    <>
      <PageHeader
        level={2}
        breadcrumb={back}
        title={job.label || prettyTitle(job.url)}
        style={{ marginBottom: 'var(--primitive-space-4)' }}
      />
      <JobCard job={job} defaultDetailsOpen />
    </>
  );
}
