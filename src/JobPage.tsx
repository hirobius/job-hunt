// A saved job's own page (#127): `#/queue/<jobId>`, inside the Pipeline tab. For now it is the
// job's card with Details open under a page header and a way back; Phase 4 (#130) turns it into
// the two-pane / full-page detail with sections.
import { useEffect } from 'react';
import { Button, Icon } from '@hirobius/design-system';
import { PageHeader } from '@hirobius/design-system/patterns';
import { ArrowLeft } from 'lucide-react';
import { findJobById, prettyTitle, useJobs } from './store';
import { openJob } from './route';
import { useCloudSync } from './account/accountContext';
import EmptyState from './EmptyState';
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

  const back = (
    <Button
      variant="tertiary"
      size="sm"
      iconLeft={<Icon icon={ArrowLeft} />}
      onClick={() => openJob(null)}
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
