// The job list column at lg and up (#130; #471: the Jobs tab is this column beside the open job):
// Jobs + Add job, the named views and their description, then one row (#614, Adrian 2026-11-12:
// "Remote only is the only thing helpful"): Remote only, with Search and Sort as quiet icon
// buttons (the search field opens under it), then one status line; then the jobs as the shared
// rows (JobRowList, #543: the All jobs sheet's list, the open one filled), then Follow up and Next
// 7 days. A hop to another job replaces
// the history entry and keeps the page's origin (return paths), so one Back leaves the job pages
// for wherever they were opened from.
import { Search } from 'lucide-react';
import { Box, Button, Icon, Input, Stack, Text } from '@hirobius/design-system';
import { useRemembered } from './viewMemory';
import { useJobs, jobIdOf } from './store';
import { getRoute, navigate } from './route';
import AddJobButton from './AddJob';
import JobViews from './JobViews';
import PipelineMenus from './PipelineMenus';
import { FollowUpSection, NextDaysSection } from './PipelineAgenda';
import { useAgendaNow } from './useAgendaNow';
import { SampleBanner } from './demo/SampleData';
import { useClosedOnBoard } from './useClosedOnBoard';
import { focusAsHeading } from './focusRescue';
import JobRowList from './JobRowList';
import RemoteOnlySwitch from './RemoteOnlySwitch';
import {
  FILTER_LABEL,
  remoteFiltered,
  setPipelineView,
  usePipelineView,
  visibleJobs,
} from './pipelineView';
import './JobRail.css';

/** Clear takes the sample's jobs, and this column with them: focus the page that replaces it (#345). */
function focusNewHeading() {
  requestAnimationFrame(() => {
    const h = document.querySelector<HTMLElement>('main h1');
    if (h) focusAsHeading(h);
  });
}

export default function JobRail({ openId }: { openId: string }) {
  const jobs = useJobs();
  const view = usePipelineView();
  const shown = visibleJobs(jobs, view);
  const closedTail = useClosedOnBoard(remoteFiltered(jobs, view.remoteOnly));
  const now = useAgendaNow(jobs);
  const [searchOpen, setSearchOpen] = useRemembered('rail:search', false);
  const searching = searchOpen || view.q.trim() !== '';

  // A hop keeps the page's origin and replaces the entry (return paths).
  const hop = (id: string) => {
    const { from, section } = getRoute();
    navigate({ jobId: id, from: from ?? null, section: section ?? null }, true);
  };

  return (
    <Box className="job-rail">
      <Stack gap="normal">
        <Stack direction="row" gap="tight" align="center" justify="space-between">
          <Text variant="body" as="h2" className="rjb-semibold">
            Jobs
          </Text>
          <AddJobButton size="sm" />
        </Stack>
        {/* The named views at the top of the list column (#541). */}
        <JobViews />
        <Stack direction="row" gap="tight" align="center" justify="space-between">
          <RemoteOnlySwitch />
          <Stack direction="row" gap="px4" align="center">
            <Button
              iconOnly
              size="sm"
              variant="tertiary"
              label="Search jobs"
              aria-expanded={searching}
              aria-controls="rjb-rail-search"
              onClick={() => {
                if (searching) setPipelineView({ q: '' });
                setSearchOpen(!searching);
              }}
              iconLeft={<Icon icon={Search} size="small" />}
            />
            <PipelineMenus size="sm" compact />
          </Stack>
        </Stack>
        {searching && (
          <Box id="rjb-rail-search">
            <Input
              size="sm"
              aria-label="Search jobs"
              placeholder="Search jobs…"
              value={view.q}
              autoFocus={searchOpen && !view.q}
              onChange={(e) => setPipelineView({ q: e.target.value })}
              leadingVisual={<Search size={16} />}
            />
          </Box>
        )}
        <Text variant="caption" as="p" tone="secondary" role="status">
          {FILTER_LABEL[view.filter]} · {shown.length} {shown.length === 1 ? 'job' : 'jobs'}
          {closedTail}
        </Text>
        <SampleBanner jobs={jobs} onCleared={focusNewHeading} />
        {shown.length === 0 ? (
          <Text variant="ui" as="p" tone="secondary">
            No jobs match.
          </Text>
        ) : (
          <JobRowList jobs={shown} openId={openId} onPick={(j) => hop(jobIdOf(j.url))} />
        )}
        {/* Under the list, so the jobs are the first thing in the column (#471). */}
        <FollowUpSection jobs={jobs} now={now} />
        <NextDaysSection jobs={jobs} now={now} />
      </Stack>
    </Box>
  );
}
