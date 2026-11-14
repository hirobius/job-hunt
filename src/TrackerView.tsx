import { useContext, useMemo, useRef, useState } from 'react';
import JobPage from './JobPage';
import { toApplyQueue } from './applyQueue';
import { jobIdOf } from './store';
import { Search, Briefcase } from 'lucide-react';
import PassedList from './PassedList';
import {
  Button as UiButton,
  Box,
  Sidebar,
  Stack,
  Text,
  VisuallyHidden,
  useAtLeast,
} from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import { useJobs } from './store';
import {
  FILTER_LABEL,
  setPipelineView,
  usePipelineView,
  visibleJobs,
  type Filter,
} from './pipelineView';
import { TrySampleButton } from './demo/SampleData';
import JobRowList from './JobRowList';
import { openJob } from './route';
import type { Job } from './types';
import { useListFocusKeeper } from './listFocus';
import { focusAsHeading } from './focusRescue';
import AddJobButton from './AddJob';
import JobViews from './JobViews';
import { CloudSyncContext } from './account/accountContext';
import { needsClientAtBoot } from './supabase';
import { tabFrozen } from './tabAccount';
import { PipelineSkeleton } from './Skeletons';
import ApplyDone from './ApplyDone';
import JobRail from './JobRail';

/** The Jobs tab (#/apply). A signed-in device with no jobs on it yet (a first visit, a new address,
 *  cleared storage) waits for its cloud copy here instead of saying "0 jobs" (#478), at every
 *  width. Then it opens on the work (#471, Adrian 2026-11-05; on a phone too since Proposal A,
 *  2026-11-08): the first job to apply to (starred first, then newest), beside the list at lg, under
 *  the filter bar and pager below it. The hash stays #/apply; a pick replaces it with that job's.
 *  With no jobs, the Pipeline page's first-run empty state. */
export default function TrackerView() {
  const jobs = useJobs();
  const view = usePipelineView();
  const sync = useContext(CloudSyncContext);
  // Decided once, as the page opens: only a stored session has a cloud copy on its way.
  const [signedIn] = useState(() => needsClientAtBoot());
  // Stopped by another tab (#288): it reads nothing more (the provider re-renders on the freeze).
  const stopped = !!tabFrozen();
  const waiting = jobs.length === 0 && signedIn && !!sync && !sync.settled && !sync.offline;
  // The cloud read failed with nothing here: say so, with Retry, never "Track your first job" (a
  // false 0 for an account that has jobs).
  // Stopped by another tab (#288), it reads nothing more: the same state, with Reload.
  if (jobs.length === 0 && signedIn && (sync?.offline || stopped))
    return (
      <Stack gap="px24">
        <Text as="h1" variant="title" className="sr-only">
          Apply
        </Text>
        <EmptyState
          onPage
          icon={Briefcase}
          title="Your jobs couldn't load"
          description={
            stopped
              ? 'Another tab changed the account. Reload to continue.'
              : "This device can't reach your account right now. Check the connection, then try again."
          }
          action={
            <UiButton variant="primary" onClick={() => sync?.retry()}>
              {stopped ? 'Reload' : 'Try again'}
            </UiButton>
          }
        />
      </Stack>
    );
  if (waiting)
    return (
      <Stack gap="normal">
        <Text variant="ui" as="p" role="status" tone="secondary">
          Loading your jobs…
        </Text>
        <PipelineSkeleton />
      </Stack>
    );
  // The first job to apply to, if the list shows it; else the list's first. With a search or
  // filter that matches nothing, the right column keeps a job (the first to apply to, else any)
  // and the list column says nothing matches: swapping the layout mid-typing would drop focus
  // from the list's search field.
  // Every width since Proposal A (Adrian 2026-11-08): on a phone too the tab is the job, with the
  // filter bar, the pager and All jobs over it (JobPage).
  const shown = visibleJobs(jobs, view);
  const next = toApplyQueue(jobs).find((j) => shown.includes(j));
  // The To apply view walked to its end (#554): the done state, not some other job. Only when
  // nothing is left to apply to at all (the profile's remote rule hiding some keeps a job, as before).
  const done =
    jobs.length > 0 &&
    view.filter === 'toApply' &&
    visibleJobs(jobs, { ...view, remoteOnly: false }).length === 0;
  if (done) return <DonePage jobs={jobs} />;
  const first = next ?? shown[0] ?? toApplyQueue(jobs)[0] ?? jobs[0];
  if (first) return <JobPage jobId={jobIdOf(first.url)} />;
  return <PipelinePage />;
}

/** The Apply list: the phone's All jobs sheet (#543, redesign plan 5.7). Add job, the named
 *  views, then the jobs as the shared rows (JobRowList: one surface, the open job filled; Passed
 *  lists PassedList). No search, filters, sort or sample line since 2026-11-13. The job page
 *  itself keeps none of these. `onOpen` opens a job in place (the sheet closes). */
export function JobsList({ onOpen, openId }: { onOpen?: (job: Job) => void; openId?: string }) {
  const jobs = useJobs();
  const view = usePipelineView();
  const { filter } = view;
  const setFilter = (filter: Filter) => setPipelineView({ filter });
  // A row that leaves the list hands focus to its neighbour, else to the views.
  const top = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => visibleJobs(jobs, view), [jobs, view]);
  const shownUrls = useMemo(() => shown.map((j) => j.url), [shown]);
  useListFocusKeeper(shownUrls, top);
  const open = onOpen ?? ((j: Job) => openJob(jobIdOf(j.url)));
  const shownLabel = `${shown.length} ${shown.length === 1 ? 'job' : 'jobs'} shown`;
  return (
    <Stack gap="normal">
      <Box ref={top}>
        <AddJobButton size="md" />
      </Box>
      <JobViews />
      {/* The list's count is not re-read as the view changes: say it (audit). */}
      <VisuallyHidden role="status">{shownLabel}</VisuallyHidden>
      {filter === 'passed' ? (
        <PassedList jobs={shown} openId={openId} onPick={open} />
      ) : shown.length === 0 ? (
        filter === 'toApply' ? (
          <EmptyState
            centered
            icon={Search}
            title="Nothing left to apply to"
            description="Check Applied, or add more jobs."
            action={
              <UiButton variant="secondary" onClick={() => setFilter('applied')}>
                Show applied
              </UiButton>
            }
          />
        ) : (
          <EmptyState
            centered
            icon={Search}
            title={`Nothing under “${FILTER_LABEL[filter]}”`}
            description="Try another view."
            action={
              <UiButton variant="secondary" onClick={() => setFilter('toApply')}>
                Show to apply
              </UiButton>
            }
          />
        )
      ) : (
        <JobRowList jobs={shown} openId={openId} onPick={open} />
      )}
    </Stack>
  );
}

/** Every job applied to or set aside (#554): the page header, then the done state on the page
 *  background; at lg the Apply list beside it, no row marked (like a Company page). */
function DonePage({ jobs }: { jobs: Job[] }) {
  const wide = useAtLeast('lg');
  const page = (
    <Stack gap="px24">
      <Box as="header">
        <Text as="h1" variant="title" className="sr-only">
          Apply
        </Text>
      </Box>
      <Box sx={{ py: 'lg' }}>
        <ApplyDone jobs={jobs} />
      </Box>
    </Stack>
  );
  if (!wide) return page;
  return (
    <Sidebar side="start" sideWidth="22rem" contentMin="50%" gap="normal">
      <JobRail openId="" />
      {page}
    </Sidebar>
  );
}

/** No jobs yet: the page header and the first-run empty state. */
function PipelinePage() {
  // Try with sample data leaves with what they changed: focus goes to the heading (#345).
  const heading = useRef<HTMLHeadingElement>(null);
  // The sample's jobs turn this page into the first job (#471): its heading is gone by then, so
  // focus the new page's own h1, once it has rendered.
  const focusPageHeading = () => {
    if (heading.current?.isConnected) focusAsHeading(heading.current);
    requestAnimationFrame(() => {
      if (heading.current?.isConnected) return;
      const h = document.querySelector<HTMLElement>('main h1');
      if (h) focusAsHeading(h);
    });
  };
  const addJobButton = <AddJobButton variant="primary" />;
  return (
    <Stack gap="px24">
      <Stack gap="tight">
        <Box as="header">
          <Text as="h1" variant="title" ref={heading} className="sr-only">
            Apply
          </Text>
        </Box>
      </Stack>
      {/* First use: the shared teaching empty (#132): what this will hold, one primary action,
          one way to see it working (rev-3 "Pipeline, empty"). */}
      <EmptyState
        onPage
        icon={Briefcase}
        title="Track your first job"
        description="Paste a job link to save it here, then apply and follow up. You can also save postings from Review."
        action={
          <Stack direction="row" wrap="wrap" gap="tight" justify="center">
            {addJobButton}
            <TrySampleButton onLoaded={focusPageHeading} />
          </Stack>
        }
      />
    </Stack>
  );
}
