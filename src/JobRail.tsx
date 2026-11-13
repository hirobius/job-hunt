// The job list column at lg and up (#130; #471: the Jobs tab is this column beside the open job):
// Jobs + Add job, the named views, then the jobs as the shared rows (JobRowList, #543: the All
// jobs sheet's list, the open one filled; Passed lists PassedList), then Follow up and Next 7 days.
// No Remote only switch, search, sort, view description, status line or sample line (Adrian
// 2026-11-13): Remote only follows the Search profile, Clear sample data is the Account menu's. A hop to another job replaces
// the history entry and keeps the page's origin (return paths), so one Back leaves the job pages
// for wherever they were opened from.
import { Box, Stack, Text } from '@hirobius/design-system';
import { useJobs, jobIdOf } from './store';
import { getRoute, navigate } from './route';
import AddJobButton from './AddJob';
import JobViews from './JobViews';
import { FollowUpSection, NextDaysSection } from './PipelineAgenda';
import { useAgendaNow } from './useAgendaNow';
import JobRowList from './JobRowList';
import PassedList from './PassedList';
import { remoteFiltered, usePipelineView, visibleJobs } from './pipelineView';
import './JobRail.css';

export default function JobRail({ openId }: { openId: string }) {
  const jobs = useJobs();
  const view = usePipelineView();
  const shown = visibleJobs(jobs, view);
  const now = useAgendaNow(jobs);

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
        {view.filter === 'passed' ? (
          <PassedList jobs={shown} openId={openId} onPick={(j) => hop(jobIdOf(j.url))} />
        ) : shown.length === 0 ? (
          <Text variant="ui" as="p" tone="secondary">
            No jobs match.
          </Text>
        ) : (
          <JobRowList jobs={shown} openId={openId} onPick={(j) => hop(jobIdOf(j.url))} />
        )}
        {/* Under the list, so the jobs are the first thing in the column (#471). */}
        <FollowUpSection jobs={remoteFiltered(jobs, view.remoteOnly)} now={now} />
        <NextDaysSection jobs={jobs} now={now} />
      </Stack>
    </Box>
  );
}
