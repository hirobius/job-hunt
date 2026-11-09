import { useContext, useMemo, useRef, useState } from 'react';
import JobPage from './JobPage';
import { toApplyQueue } from './applyQueue';
import { jobIdOf } from './store';
import { Search, Briefcase } from 'lucide-react';
import {
  Button as UiButton,
  Input as HdsInput,
  Box,
  Card,
  Stack,
  Text,
  VisuallyHidden,
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
import { SampleBanner, TrySampleButton } from './demo/SampleData';
import ApplyQueueSummary from './ApplyQueueSummary';
import JobListCard from './JobListCard';
import { Panel, PanelBody } from './PipelinePanel';
import type { Job } from './types';
import { useListFocusKeeper } from './listFocus';
import { focusAsHeading } from './focusRescue';
import AddJobButton from './AddJob';
import PipelineMenus from './PipelineMenus';
import { CloudSyncContext } from './account/accountContext';
import { needsClientAtBoot } from './supabase';
import { PipelineSkeleton } from './Skeletons';

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
  const waiting = jobs.length === 0 && signedIn && !!sync && !sync.settled && !sync.offline;
  // The cloud read failed with nothing here: say so, with Retry, never "Track your first job" (a
  // false 0 for an account that has jobs).
  // Stopped by another tab (#288), it reads nothing more: the same state, with Reload.
  if (jobs.length === 0 && signedIn && (sync?.offline || sync?.stopped))
    return (
      <Stack gap="px24">
        <Text as="h1" variant="title">
          Apply
        </Text>
        <EmptyState
          framed
          icon={Briefcase}
          title="Your jobs couldn't load"
          description={
            sync.stopped
              ? 'Another tab changed the account. Reload to continue.'
              : "This device can't reach your account right now. Check the connection, then try again."
          }
          action={
            <UiButton variant="primary" onClick={sync.retry}>
              {sync.stopped ? 'Reload' : 'Try again'}
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
  const first = next ?? shown[0] ?? toApplyQueue(jobs)[0] ?? jobs[0];
  if (first) return <JobPage jobId={jobIdOf(first.url)} />;
  return <PipelinePage />;
}

/** The Apply list (the phone's All jobs sheet since Proposal A, Adrian 2026-11-08): Follow up and
 *  Next 7 days, then the Jobs panel (search, Status, Sort, Clear) with each job its own card (the
 *  Find cards' gap). `onOpen` opens a job in place (the sheet closes). */
export function JobsList({ onOpen }: { onOpen?: (job: Job) => void }) {
  const jobs = useJobs();
  const view = usePipelineView();
  const { filter, q } = view;
  const setFilter = (filter: Filter) => setPipelineView({ filter });
  const setQ = (q: string) => setPipelineView({ q });
  // A control that clears the view unmounts as it does, so focus goes to the search (audit).
  const searchField = useRef<HTMLInputElement>(null);
  const focusSearch = () => searchField.current?.focus();
  // Something is non-default: Clear shows, and the selects drop their Status / Sort key (rev-3).
  const cleared = filter !== 'active' || q.trim() !== '';
  // The Status select: the Active empty's "Show applied" hands focus back to it, so focus
  // stays in the panel when the empty state unmounts (#361).
  const statusTrigger = useRef<HTMLButtonElement>(null);
  const shown = useMemo(() => visibleJobs(jobs, view), [jobs, view]);
  const shownUrls = useMemo(() => shown.map((j) => j.url), [shown]);
  // Mark applied, Remove or a status change that takes a card out keeps focus in the list.
  useListFocusKeeper(shownUrls, searchField);
  return (
    <Stack gap="px24">
      <ApplyQueueSummary jobs={jobs} />
      <Panel
        label="Jobs"
        title="Jobs"
        flat
        count={shown.length}
        countLabel={`${shown.length} ${shown.length === 1 ? 'job' : 'jobs'} shown`}
        // The filter and search back to their defaults, shown only when one isn't. It lives in
        // the header (like the Documents panels' New), so Status and Sort always split the
        // whole row and never truncate.
        trailing={
          cleared ? (
            <UiButton
              variant="tertiary"
              size="sm"
              label="Clear filters"
              onClick={() => {
                setPipelineView({ filter: 'active', q: '' });
                focusSearch();
              }}
            >
              Clear
            </UiButton>
          ) : undefined
        }
      >
        <PanelBody>
          <Box className="rjb-form-full">
            <Stack gap="tight">
              <HdsInput
                ref={searchField}
                aria-label="Search saved jobs"
                placeholder="Search jobs"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                leadingVisual={<Search size={16} />}
              />
              <PipelineMenus statusTrigger={statusTrigger} />
            </Stack>
          </Box>
        </PanelBody>
        {/* The count badge is not re-read as the search or filter changes: say it (audit). */}
        <VisuallyHidden role="status">{`${shown.length} ${shown.length === 1 ? 'job' : 'jobs'} shown`}</VisuallyHidden>
        {shown.length === 0 ? (
          // Its own section under the toolbar, a hairline above (rev-3 filtered-empty).
          <Box sx={{ borderTop: 'thin solid', borderColor: 'border.default', py: 'lg' }}>
            <PanelBody>
              {q.trim() ? (
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
              ) : filter === 'active' ? (
                <EmptyState
                  centered
                  icon={Search}
                  title="Nothing left to apply to"
                  description="Check Applied, or add more jobs."
                  action={
                    <UiButton
                      variant="secondary"
                      onClick={() => {
                        setFilter('Applied');
                        statusTrigger.current?.focus();
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
                  description="Try another status."
                  action={
                    <UiButton
                      variant="secondary"
                      onClick={() => {
                        setFilter('active');
                        focusSearch();
                      }}
                    >
                      Show active
                    </UiButton>
                  }
                />
              )}
            </PanelBody>
          </Box>
        ) : (
          // Each job its own card (Adrian 2026-11-08), the Find cards' gap; the panel is flat.
          <Box as="div" role="list" sx={{ display: 'flex', flexDirection: 'column', gap: 'sm' }}>
            {shown.map((j) => (
              <Box role="listitem" key={j.url}>
                <Card padding="none">
                  <Box sx={{ px: 'md' }}>
                    <JobListCard job={j} onOpen={onOpen} />
                  </Box>
                </Card>
              </Box>
            ))}
          </Box>
        )}
      </Panel>
    </Stack>
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
          <Text as="h1" variant="title" ref={heading}>
            Apply
          </Text>
        </Box>
        <SampleBanner jobs={jobs} onCleared={focusPageHeading} />
      </Stack>
      {/* First use: the shared teaching empty (#132): what this will hold, one primary action,
          one way to see it working (rev-3 "Pipeline, empty"). */}
      <EmptyState
        framed
        icon={Briefcase}
        title="Track your first job"
        description="Paste a job link to save it here, then apply and follow up. You can also save postings from Review new on Find."
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
