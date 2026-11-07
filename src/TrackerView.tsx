import { useContext, useMemo, useRef, useState } from 'react';
import { useAtLeast } from '@hirobius/design-system';
import JobPage from './JobPage';
import { toApplyQueue } from './applyQueue';
import { jobIdOf } from './store';
import { Search, Briefcase } from 'lucide-react';
import {
  Button as UiButton,
  Input as HdsInput,
  Box,
  Stack,
  Text,
  VisuallyHidden,
} from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import { MetaCaption } from './MetaCaption';
import { useJobs } from './store';
import {
  FILTER_LABEL,
  filterCounts,
  setPipelineView,
  usePipelineView,
  visibleJobs,
  type Filter,
} from './pipelineView';
import { SampleBanner, TrySampleButton } from './demo/SampleData';
import ApplyQueueSummary from './ApplyQueueSummary';
import JobListCard from './JobListCard';
import { ItemList, Panel, PanelBody } from './PipelinePanel';
import { PipelineLiveness } from './LivenessViews';
import { useListFocusKeeper } from './listFocus';
import { focusAsHeading } from './focusRescue';
import AddJobButton from './AddJob';
import PipelineMenus from './PipelineMenus';
import { CloudSyncContext } from './account/accountContext';
import { needsClientAtBoot } from './supabase';
import { PipelineSkeleton } from './Skeletons';

/** The Jobs tab (#/apply). A signed-in device with no jobs on it yet (a first visit, a new address,
 *  cleared storage) waits for its cloud copy here instead of saying "0 jobs" (#478), at every
 *  width. Then, at lg, it opens on the work (#471, Adrian 2026-11-05): the job list beside the
 *  first job to apply to (starred first, then newest). The hash stays #/apply; a pick in the list
 *  replaces it with that job's. Below lg, and with no jobs, the Pipeline page. */
export default function TrackerView() {
  const jobs = useJobs();
  const view = usePipelineView();
  const wide = useAtLeast('lg');
  const sync = useContext(CloudSyncContext);
  // Decided once, as the page opens: only a stored session has a cloud copy on its way.
  const [signedIn] = useState(() => needsClientAtBoot());
  const waiting = jobs.length === 0 && signedIn && !!sync && !sync.settled && !sync.offline;
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
  const shown = wide ? visibleJobs(jobs, view) : [];
  const next = toApplyQueue(jobs).find((j) => shown.includes(j));
  const first = wide ? (next ?? shown[0] ?? toApplyQueue(jobs)[0] ?? jobs[0]) : undefined;
  if (first) return <JobPage jobId={jobIdOf(first.url)} />;
  return <PipelinePage />;
}

function PipelinePage() {
  const jobs = useJobs();
  const view = usePipelineView();
  const { filter, q } = view;
  const setFilter = (filter: Filter) => setPipelineView({ filter });
  const setQ = (q: string) => setPipelineView({ q });
  // A control that clears the view unmounts as it does, so focus goes to the search (audit).
  const searchField = useRef<HTMLInputElement>(null);
  const focusSearch = () => searchField.current?.focus();
  // Try with sample data and Clear leave with what they changed: focus goes to the heading (#345).
  const heading = useRef<HTMLHeadingElement>(null);
  // From lg the sample's jobs turn this page into the list beside the first job (#471): its
  // heading is gone by then, so focus the new page's own h1, once it has rendered.
  const focusPageHeading = () => {
    if (heading.current?.isConnected) focusAsHeading(heading.current);
    requestAnimationFrame(() => {
      if (heading.current?.isConnected) return;
      const h = document.querySelector<HTMLElement>('main h1');
      if (h) focusAsHeading(h);
    });
  };
  // Something is non-default: Clear shows, and the selects drop their Status / Sort key (rev-3).
  const cleared = filter !== 'active' || q.trim() !== '';
  // The Status select: the Active empty's "Show applied" hands focus back to it, so focus
  // stays in the panel when the empty state unmounts (#361).
  const statusTrigger = useRef<HTMLButtonElement>(null);

  const shown = useMemo(() => visibleJobs(jobs, view), [jobs, view]);
  const shownUrls = useMemo(() => shown.map((j) => j.url), [shown]);
  // Mark applied, Remove or a status change that takes a card out keeps focus in the list.
  useListFocusKeeper(shownUrls, searchField);
  const counts = useMemo(() => filterCounts(jobs), [jobs]);

  // Start applying is the page's one primary once there are jobs; Add job steps down.
  const addJobButton = <AddJobButton variant={jobs.length > 0 ? 'secondary' : 'primary'} />;

  return (
    // Rev-3 rhythm: 4 from the title to its counts, 12 to the sample note, 24 to the panels.
    <Stack gap="px24">
      <Stack gap="tight">
        {/* One page header: the screen's name, its counts 4 under it (rev-3 mock) and its one
            primary action, centred against both lines. Not HDS PageHeader: its description slot
            drops below the actions row with a 12 gap on a phone, and its title slot is the h2
            itself, so it can't hold the counts. */}
        <Box as="header">
          <Stack direction="row" gap="px8" align="center" justify="space-between">
            <Stack gap="px4">
              <Text as="h1" variant="title" ref={heading}>
                Apply
              </Text>
              <MetaCaption
                items={
                  jobs.length > 0 ? [`${counts.active} active`, `${counts.all} total`] : ['0 jobs']
                }
              />
            </Stack>
            {/* One primary action per state: on first use it lives in the empty state instead. */}
            {jobs.length > 0 && addJobButton}
          </Stack>
        </Box>
        <SampleBanner jobs={jobs} onCleared={focusPageHeading} />
      </Stack>
      <Stack gap="px24">
        {/* Simplify Jobs (#416, Adrian's keep list): To apply + Start applying, Follow up and Next
            7 days, then the job list. Getting started and the scored queue are gone; Recently
            removed and Export links live in the Account menu. */}
        {jobs.length > 0 && <ApplyQueueSummary jobs={jobs} />}
        {/* The Jobs panel (rev-3 item 1): a full-width search, then Status and Sort as one row
            of select-style menus, all 40px, and a quiet Clear only when something is
            non-default. No panel until there is something to search or filter. */}
        {jobs.length > 0 && (
          <Panel
            label="Jobs"
            title="Jobs"
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
              {/* The full-width search (the panel's width at every size): no form-control cap, and
                  Status and Sort split the row. */}
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
                  {/* Liveness sits with the list it checks: one caption-sized row under the
                      toolbar, never above the page title. */}
                  <PipelineLiveness jobs={jobs} />
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
              // Cards at every width (Adrian 2026-10-24): the 920 shell wrapped table titles to
              // three lines.
              <ItemList as="div">
                {shown.map((j) => (
                  <JobListCard key={j.url} job={j} />
                ))}
              </ItemList>
            )}
          </Panel>
        )}
        {jobs.length === 0 && (
          // First use: the shared teaching empty (#132): what this will hold, one primary action,
          // one way to see it working (rev-3 "Pipeline, empty").
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
        )}
      </Stack>
    </Stack>
  );
}
