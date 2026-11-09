// A saved job's Apply view (#127, #130, #471): `#/apply/<jobId>`, inside the Apply tab. A header
// (badges, title, one next step, menu) over one page (#416: Details, Notes, Documents, Decks). At
// lg the list sits beside it; below lg it stands alone, with Back and the "‹ 2 of N ›" pager.
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { Box, Button, Skeleton, Stack, Text, Sidebar, useAtLeast } from '@hirobius/design-system';
import { findJobById, jobIdOf, useJobs } from './store';
import { titleOf } from './jobRow';
import { usePageTitle } from './pageTitle';
import {
  getRoute,
  goBack,
  goBackTo,
  navigate,
  openJob,
  originOf,
  useRoute,
  type Route,
} from './route';
import { getPipelineView, nearestShown, usePipelineView, visibleJobs } from './pipelineView';
import ApplyFilterBar from './ApplyFilterBar';
import AllJobsSheet from './AllJobsSheet';
import { useBackCloses } from './useBackCloses';
import ApplyPager from './ApplyPager';
import { ApplicationKit, ApplyTemplates } from './ApplySheet';
import { scrollToTop } from './scrollMemory';
import { useCloudSync } from './account/accountContext';
import JobHeader from './JobHeader';
import JobOverview from './JobOverview';
import JobRail from './JobRail';
import type { Job } from './types';

/** The header over the one page (#416, Adrian's Q5: no tabs). An old `?section=` link opens it
 *  as is. The job page and Apply mode are one view (#471, Adrian 2026-11-05): the header's Open
 *  application, Mark applied and Not a fit, then the job's filled templates and the Application
 *  kit, then Details, Notes and the links. */
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
      <Stack gap="px24">
        <ApplyTemplates job={job} />
        <ApplicationKit job={job} />
        <JobOverview job={job} />
      </Stack>
    </Box>
  );
}

/** After Mark applied or Not a fit (#471), open the job after this one in the list as it shows
 *  now (else the one before it). Called before the answer lands, so the job still has its place.
 *  In place: Back does not walk every job. */
function openNextAfter(job: Job, jobs: Job[]) {
  const shown = visibleJobs(jobs, getPipelineView());
  const at = shown.findIndex((j) => j.url === job.url);
  const next = at < 0 ? shown[0] : (shown[at + 1] ?? shown[at - 1]);
  // The last one in the list: back to the list (or wherever the job was opened from).
  if (!next || next.url === job.url) return goBack(APPLY_LIST);
  const { from, section } = getRoute();
  navigate(
    { tab: 'apply', jobId: jobIdOf(next.url), from: from ?? null, section: section ?? null },
    true,
  );
}

const APPLY_LIST: Route = { tab: 'apply', sub: null, pillar: null, jobId: null };

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
  // Below lg (Proposal A, Adrian 2026-11-08): one Apply screen. The filter bar on top, a sticky
  // "‹ 3 of 55 ›" over the jobs the filter shows (a swipe steps it too), then the job in full.
  // All jobs opens a sheet to jump to any job. A job opened from elsewhere keeps its Back.
  const list = visibleJobs(jobs, view);
  const order = visibleJobs(jobs, { ...view, filter: 'all', q: '', remoteOnly: false });
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
        <ApplyFilterBar jobs={jobs} />
        <Box className="rjb-apply-pager">
          <Stack direction="row" gap="tight" align="center" justify="space-between">
            <ApplyPager job={job} list={list} order={order} />
            <Button size="md" variant="secondary" onClick={() => setAll(true)}>
              All jobs
            </Button>
          </Stack>
        </Box>
        <SwipeArea onPrev={() => step(-1)} onNext={() => step(1)}>
          <JobDetail
            key={job.url}
            job={job}
            showBack={!!origin}
            onAnswered={() => openNextAfter(job, jobs)}
          />
        </SwipeArea>
      </Stack>
      <AllJobsSheet jobs={jobs} open={all} onOpenChange={setAll} />
    </Box>
  );
}

/** True when `el` is inside something that scrolls sideways (below `root`): its own swipe. */
function inSideScroller(el: Element, root: Element): boolean {
  for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
    const x = getComputedStyle(n).overflowX;
    if ((x === 'auto' || x === 'scroll') && n.scrollWidth > n.clientWidth) return true;
  }
  return false;
}

/** A horizontal swipe on the job steps the pager (Proposal A: "swipe left and right on the card").
 *  Only a clear sideways swipe of 64px or more counts, never one that starts in a field. */
function SwipeArea({
  onPrev,
  onNext,
  children,
}: {
  onPrev: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <Box
      className="rjb-swipe"
      onTouchStart={(e: TouchEvent<HTMLDivElement>) => {
        const t = e.touches[0];
        const from = e.target as Element;
        const field = from.closest('input, textarea, [contenteditable="true"]');
        start.current =
          t && !field && !inSideScroller(from, e.currentTarget)
            ? { x: t.clientX, y: t.clientY }
            : null;
      }}
      onTouchEnd={(e: TouchEvent<HTMLDivElement>) => {
        const s = start.current;
        const t = e.changedTouches[0];
        start.current = null;
        if (!s || !t) return;
        // Selecting text drags sideways too: that is not a swipe.
        if (window.getSelection()?.toString()) return;
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) onNext();
        else onPrev();
      }}
    >
      {children}
    </Box>
  );
}
