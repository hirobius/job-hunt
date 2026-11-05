// The job list column at lg and up (#130; #471: the Jobs tab is this column beside the open job):
// Add job, the search, Status and Sort (the Pipeline's shared view, pipelineView), Follow up and
// Next 7 days, then the jobs as compact links, the open one marked, each with its posting link
// beside it (Adrian 2026-10-22). A hop to another job replaces
// the history entry and keeps the page's origin (return paths), so one Back leaves the job pages
// for wherever they were opened from.
import { Search } from 'lucide-react';
import { Box, Input, NavList, Stack, Text } from '@hirobius/design-system';
import { useJobs, jobIdOf } from './store';
import { getRoute, jobHash, navigate } from './route';
import { inPlaceClick } from './back';
import AddJobButton from './AddJob';
import PipelineMenus from './PipelineMenus';
import { FollowUpSection, NextDaysSection } from './PipelineAgenda';
import { useAgendaNow } from './useAgendaNow';
import { rowView } from './jobRow';
import { JobBadges } from './JobRowParts';
import { JobPostingLink } from './PostingLink';
import { NavListActionItem } from './hds-gaps/NavListActionItem';
import { FILTER_LABEL, setPipelineView, usePipelineView, visibleJobs } from './pipelineView';
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

export default function JobRail({ openId }: { openId: string }) {
  const jobs = useJobs();
  const view = usePipelineView();
  const shown = visibleJobs(jobs, view);
  const open = jobs.find((j) => jobIdOf(j.url) === openId);
  // The open job stays on screen even when the filter or search would hide it.
  const hidden = !!open && !shown.some((j) => j.url === open.url);
  const now = useAgendaNow(jobs);

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
        <Input
          size="sm"
          aria-label="Search jobs"
          placeholder="Search jobs…"
          value={view.q}
          onChange={(e) => setPipelineView({ q: e.target.value })}
          leadingVisual={<Search size={16} />}
        />
        <PipelineMenus size="sm" />
        <FollowUpSection jobs={jobs} now={now} />
        <NextDaysSection jobs={jobs} now={now} />
        <Text variant="caption" as="p" tone="secondary" role="status">
          {FILTER_LABEL[view.filter]} · {shown.length} {shown.length === 1 ? 'job' : 'jobs'}
        </Text>
        <nav aria-label="Jobs">
          <Stack gap="normal">
            {hidden && open && (
              <Stack gap="tight">
                <NavList>{item(open)}</NavList>
                <Text variant="caption" as="p" tone="secondary">
                  Not in this filter
                </Text>
              </Stack>
            )}
            {shown.length === 0 && !hidden ? (
              <Text variant="ui" as="p" tone="secondary">
                No jobs match.
              </Text>
            ) : (
              <NavList>{shown.map(item)}</NavList>
            )}
          </Stack>
        </nav>
      </Stack>
    </Box>
  );
}
