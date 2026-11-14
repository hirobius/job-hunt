// A saved job's Apply view (#127, #130, #471): `#/apply/<jobId>`, inside the Apply tab. A header
// (badges, title, one next step, menu) over one page (#416: Details, Notes, Documents, Decks). At
// lg the list sits beside it; below lg it stands alone, with Back and the "‹ 2 of N ›" pager.
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import {
  Box,
  Button,
  Skeleton,
  Stack,
  Text,
  Sidebar,
  useAtLeast,
  VisuallyHidden,
} from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import { findJobById, jobIdOf, useJobs } from './store';
import { titleOf } from './jobRow';
import { usePageTitle } from './pageTitle';
import { goBackTo, openJob, originOf, useRoute } from './route';
import {
  FILTER_LABEL,
  nearestShown,
  setPipelineView,
  usePipelineView,
  visibleJobs,
} from './pipelineView';
import { openNextAfter } from './applyNext';
import AllJobsSheet from './AllJobsSheet';
import { useBackCloses } from './useBackCloses';
import ApplyWalk from './ApplyWalk';
import { SwipeArea } from './SwipeArea';
import { useFollowView } from './followView';
import { scrollToTop } from './scrollMemory';
import { useCloudSync } from './account/accountContext';
import JobHeader from './JobHeader';
import JobOverview from './JobOverview';
import JobRail from './JobRail';
import type { Job } from './types';

/** The header over the one page (#416, Adrian's Q5: no tabs). An old `?section=` link opens it
 *  as is. The job page and Apply mode are one view (#471, Adrian 2026-11-05): the header's Open
 *  application, Mark applied and Not a fit, then Details, Notes and the links. */
function JobDetail({
  job,
  showBack,
  onAnswered,
}: {
  job: Job;
  showBack: boolean;
  onAnswered?: () => void;
}) {
  return (
    <Box>
      <JobHeader job={job} showBack={showBack} onAnswered={onAnswered} />
      {/* The Application kit ("Copy into the form") left the job view (Adrian 2026-11-13); its data
          stays (rjb_apply_kit, blob v6). Every template stays in Documents. */}
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
  const jobs = useJobs();
  const job = findJobById(jobId, jobs);
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
  const view = usePipelineView();
  const viewEmpty = useFollowView(job, jobs, view);
  const [all, setAll] = useState(false);
  // The id AllJobsSheet pops on a jump.
  useBackCloses(all, () => setAll(false), 'all-jobs');

  // Not found yet: it may be about to sync in, so wait quietly. Once sync has settled the effect
  // above has already sent us back to the Pipeline.
  if (!job) return <JobPageSkeleton />;

  // Keyed by job, so every field's draft resets when the job changes. At lg the list stands in for
  // Back to it, but a job opened from elsewhere (Find, a Company page) shows its Back. Below lg the
  // Back sits in one row with the pager instead.
  const detail = (
    <JobDetail
      key={job.url}
      job={job}
      showBack={wide && !!origin}
      onAnswered={() => openNextAfter(job, jobs)}
    />
  );
  if (wide)
    return (
      <Sidebar side="start" sideWidth="22rem" contentMin="50%" gap="normal">
        <JobRail openId={jobId} />
        {detail}
      </Sidebar>
    );
  // Below lg (Proposal A, Adrian 2026-11-08): one Apply screen. The sticky walk control (#542: view picker, "‹ 3 of 55 ›"; a swipe steps it too),
  // then the job in full. The picker's "All jobs" opens the All jobs sheet: Add job, the views
  // and the list (#543; no search, filters or sort since 2026-11-13). A job opened from elsewhere keeps its Back.
  const list = visibleJobs(jobs, view);
  const order = visibleJobs(jobs, { ...view, filter: 'all', remoteOnly: false });
  const at = list.findIndex((j) => j.url === job.url);
  const step = (d: -1 | 1) => {
    // A job the filter hides steps to the nearest shown one, as its pager does.
    const near = at < 0 ? nearestShown(job, list, order) : null;
    const to = near ? (d < 0 ? near.prev : near.next) : list[at + d];
    if (to) openJob(jobIdOf(to.url), true);
  };
  return (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <Stack gap="normal">
        <Box className="rjb-apply-pager">
          <ApplyWalk
            job={job}
            jobs={jobs}
            list={list}
            order={order}
            onAllJobs={() => setAll(true)}
            empty={viewEmpty}
          />
        </Box>
        {viewEmpty ? (
          <Stack gap="normal">
            {/* The page keeps its one h1 while no job shows. */}
            <VisuallyHidden>
              <Text as="h1" variant="title">
                Apply
              </Text>
            </VisuallyHidden>
            <EmptyState
              centered
              icon={Search}
              title={`Nothing under “${FILTER_LABEL[view.filter]}”`}
              description={
                view.filter === 'passed'
                  ? 'Postings you skipped in Find are in All jobs.'
                  : 'Try another view.'
              }
              action={
                view.filter === 'passed' ? (
                  <Button variant="secondary" onClick={() => setAll(true)}>
                    All jobs
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setPipelineView({ filter: 'toApply' })}
                  >
                    Show to apply
                  </Button>
                )
              }
            />
          </Stack>
        ) : (
          <SwipeArea onPrev={() => step(-1)} onNext={() => step(1)}>
            <JobDetail
              key={job.url}
              job={job}
              showBack={!!origin}
              onAnswered={() => openNextAfter(job, jobs)}
            />
          </SwipeArea>
        )}
      </Stack>
      <AllJobsSheet openId={jobId} open={all} onOpenChange={setAll} />
    </Box>
  );
}
