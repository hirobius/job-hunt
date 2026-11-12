// The job list column at lg and up (#130; #471: the Jobs tab is this column beside the open job):
// Jobs + Add job, the named views and their description, then one row (#614, Adrian 2026-11-12:
// "Remote only is the only thing helpful"): Remote only, with Search and Sort as quiet icon
// buttons (the search field opens under it), then one status line; Follow up and Next 7 days, then the jobs as compact links, the open one marked, each with its posting link
// beside it (Adrian 2026-10-22). A hop to another job replaces
// the history entry and keeps the page's origin (return paths), so one Back leaves the job pages
// for wherever they were opened from.
import { Search } from 'lucide-react';
import { Box, Button, Icon, Input, NavList, Stack, Text } from '@hirobius/design-system';
import { useRemembered } from './viewMemory';
import { useJobs, jobIdOf } from './store';
import { getRoute, jobHash, navigate } from './route';
import { inPlaceClick } from './back';
import AddJobButton from './AddJob';
import JobViews from './JobViews';
import PipelineMenus from './PipelineMenus';
import { FollowUpSection, NextDaysSection } from './PipelineAgenda';
import { useAgendaNow } from './useAgendaNow';
import { SampleBanner } from './demo/SampleData';
import { useClosedOnBoard } from './useClosedOnBoard';
import { focusAsHeading } from './focusRescue';
import { rowView } from './jobRow';
import { JobBadges } from './JobRowParts';
import { JobPostingLink } from './PostingLink';
import { NavListActionItem } from './hds-gaps/NavListActionItem';
import { RemoteOnlySwitch } from './ApplyFilterBar';
import {
  FILTER_LABEL,
  remoteFiltered,
  setPipelineView,
  usePipelineView,
  visibleJobs,
} from './pipelineView';
import type { Job } from './types';
import './JobRail.css';
import CompanyLogo from './CompanyLogo';

function RowBody({ job }: { job: Job }) {
  const v = rowView(job);
  return (
    <Stack gap="tight">
      {/* One badge row above the title (rev-3 B), as on the Pipeline cards. */}
      <JobBadges job={job} />
      <Box sx={{ overflowWrap: 'anywhere' }}>
        <Text variant="ui" as="div" className="rjb-semibold">
          {v.title}
        </Text>
      </Box>
      <Stack direction="row" gap="px8" align="center">
        {job.company && <CompanyLogo company={job.company} postings={[job.url]} />}
        <Stack>
          {v.factLines.map((line, i) => (
            <Text key={i} variant="caption" as="span" tone="secondary">
              {line}
            </Text>
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
}

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

  // Rows are links (each job has its own route), as NavList's link mode. The posting link sits
  // beside each row's link, not in it: NavList.Item has no slot for that (hds-gaps).
  // A hop keeps the open tab (#334), so fit can be compared job to job on Screening.
  const hop = (id: string) => () => {
    const { from, section } = getRoute();
    navigate({ jobId: id, from: from ?? null, section: section ?? null }, true);
  };
  const item = (j: Job) => (
    <NavListActionItem
      key={j.url}
      href={jobHash(jobIdOf(j.url))}
      current={jobIdOf(j.url) === openId}
      onClick={inPlaceClick(hop(jobIdOf(j.url)))}
      action={<JobPostingLink job={j} />}
    >
      <RowBody job={j} />
    </NavListActionItem>
  );

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
        <nav aria-label="Jobs">
          <Stack gap="normal">
            {shown.length === 0 ? (
              <Text variant="ui" as="p" tone="secondary">
                No jobs match.
              </Text>
            ) : (
              <NavList>{shown.map(item)}</NavList>
            )}
          </Stack>
        </nav>
        {/* Under the list, so the jobs are the first thing in the column (#471). */}
        <FollowUpSection jobs={jobs} now={now} />
        <NextDaysSection jobs={jobs} now={now} />
      </Stack>
    </Box>
  );
}
