import { useContext, useMemo, useRef, useState } from 'react';
import JobPage from './JobPage';
import { toApplyQueue } from './applyQueue';
import { jobIdOf } from './store';
import { Search, Briefcase } from 'lucide-react';
import {
  Button as UiButton,
  Input as HdsInput,
  Box,
  Sidebar,
  Stack,
  Tag,
  Text,
  VisuallyHidden,
  useAtLeast,
} from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import { useJobs } from './store';
import {
  FILTER_LABEL,
  filtersOn,
  setPipelineView,
  usePipelineView,
  visibleJobs,
  type Filter,
} from './pipelineView';
import { SampleBanner, TrySampleButton } from './demo/SampleData';
import JobRowList from './JobRowList';
import { openJob } from './route';
import type { Job } from './types';
import { useListFocusKeeper } from './listFocus';
import { focusAsHeading, focusNewHeading, pageHeadingNow } from './focusRescue';
import AddJobButton from './AddJob';
import JobViews from './JobViews';
import PipelineMenus from './PipelineMenus';
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
  // nothing is left to apply to at all (Remote only hiding some keeps a job, as before).
  const done =
    jobs.length > 0 &&
    view.filter === 'toApply' &&
    !view.q.trim() &&
    visibleJobs(jobs, { ...view, remoteOnly: false }).length === 0;
  if (done) return <DonePage jobs={jobs} />;
  const first = next ?? shown[0] ?? toApplyQueue(jobs)[0] ?? jobs[0];
  if (first) return <JobPage jobId={jobIdOf(first.url)} />;
  return <PipelinePage />;
}

/** The Apply list: the phone's All jobs sheet (#543, redesign plan 5.7). Add job, the named views,
 *  the search, the filter chips (Remote only), the Sort chip and "Clear N" while a filter is on,
 *  then the jobs as the shared rows (JobRowList: one surface, the open job filled). The job page
 *  itself keeps none of these. `onOpen` opens a job in place (the sheet closes). */
export function JobsList({ onOpen, openId }: { onOpen?: (job: Job) => void; openId?: string }) {
  const jobs = useJobs();
  const view = usePipelineView();
  const { filter, q, remoteOnly } = view;
  const setFilter = (filter: Filter) => setPipelineView({ filter });
  const setQ = (q: string) => setPipelineView({ q });
  // A control that clears the view unmounts as it does, so focus goes to the search (audit).
  const searchField = useRef<HTMLInputElement>(null);
  const focusSearch = () => searchField.current?.focus();
  const on = filtersOn(view);
  const shown = useMemo(() => visibleJobs(jobs, view), [jobs, view]);
  const shownUrls = useMemo(() => shown.map((j) => j.url), [shown]);
  // Mark applied, Remove or a status change that takes a row out keeps focus in the list.
  useListFocusKeeper(shownUrls, searchField);
  const open = onOpen ?? ((j: Job) => openJob(jobIdOf(j.url)));
  const shownLabel = `${shown.length} ${shown.length === 1 ? 'job' : 'jobs'} shown`;
  return (
    <Stack gap="normal">
      <Box>
        <AddJobButton size="md" />
      </Box>
      <JobViews />
      <Box className="rjb-form-full">
        <HdsInput
          ref={searchField}
          aria-label="Search saved jobs"
          placeholder="Search jobs"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          leadingVisual={<Search size={16} />}
        />
      </Box>
      <Stack direction="row" wrap="wrap" gap="px8" align="center" role="group" aria-label="Filters">
        <Tag
          active={!!remoteOnly}
          aria-pressed={!!remoteOnly}
          onClick={() => setPipelineView({ remoteOnly: !remoteOnly })}
        >
          Remote only
        </Tag>
        <PipelineMenus chip />
        {on > 0 && (
          <UiButton
            variant="tertiary"
            size="md"
            label={`Clear ${on} ${on === 1 ? 'filter' : 'filters'}`}
            onClick={() => {
              setPipelineView({ q: '', remoteOnly: false });
              focusSearch();
            }}
          >
            {`Clear ${on}`}
          </UiButton>
        )}
      </Stack>
      {/* Clear takes the jobs, and this sheet with them: focus the page that replaces it (#345). */}
      <SampleBanner jobs={jobs} onCleared={() => focusNewHeading(pageHeadingNow())} />
      {/* The list's count is not re-read as the search or filter changes: say it (audit). */}
      <VisuallyHidden role="status">{shownLabel}</VisuallyHidden>
      {shown.length === 0 ? (
        q.trim() ? (
          <EmptyState
            centered
            icon={Search}
            title={`No jobs match "${q.trim()}"`}
            description="Try a shorter word, or clear the search."
            action={
              <UiButton
                variant="secondary"
                onClick={() => {
                  setQ('');
                  focusSearch();
                }}
              >
                Clear search
              </UiButton>
            }
          />
        ) : filter === 'toApply' ? (
          <EmptyState
            centered
            icon={Search}
            title="Nothing left to apply to"
            description="Check Applied, or add more jobs."
            action={
              <UiButton
                variant="secondary"
                onClick={() => {
                  setFilter('applied');
                  focusSearch();
                }}
              >
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
              <UiButton
                variant="secondary"
                onClick={() => {
                  setFilter('toApply');
                  focusSearch();
                }}
              >
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
  const jobs = useJobs();
  // Try with sample data and Clear leave with what they changed: focus goes to the heading (#345).
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
        <SampleBanner jobs={jobs} onCleared={focusPageHeading} />
      </Stack>
      {/* First use: the shared teaching empty (#132): what this will hold, one primary action,
          one way to see it working (rev-3 "Pipeline, empty"). */}
      <EmptyState
        onPage
        icon={Briefcase}
        title="Track your first job"
        description="Paste a job link to save it here, then apply and follow up. You can also save postings from Review on Find."
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
