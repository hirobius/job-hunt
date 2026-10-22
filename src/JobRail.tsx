// The job page's list rail at lg and up (#130): the jobs the Pipeline list showed, as compact
// links, with the open one marked, each with its posting link beside it (Adrian 2026-10-22). It
// reads the Pipeline's shared filter and sort (pipelineView); only the search is editable here, and
// "Change filters" goes back to the list.
import { Search } from 'lucide-react';
import { Box, Input, InlineLink, NavList, Stack, Text } from '@hirobius/design-system';
import { useJobs, jobIdOf } from './store';
import { jobHash } from './route';
import { rowView } from './jobRow';
import { JobBadges } from './JobRowParts';
import { JobPostingLink } from './PostingLink';
import { NavListActionItem } from './hds-gaps/NavListActionItem';
import { FILTER_LABEL, setPipelineView, usePipelineView, visibleJobs } from './pipelineView';
import type { Job } from './types';
import './JobRail.css';

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
      {v.factLines.map((line, i) => (
        <Text key={i} variant="caption" as="span" tone="secondary">
          {line}
        </Text>
      ))}
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

  // Rows are links (each job has its own route), as NavList's link mode. The posting link sits
  // beside each row's link, not in it: NavList.Item has no slot for that (hds-gaps).
  const item = (j: Job) => (
    <NavListActionItem
      key={j.url}
      href={jobHash(jobIdOf(j.url))}
      current={jobIdOf(j.url) === openId}
      action={<JobPostingLink job={j} />}
    >
      <RowBody job={j} />
    </NavListActionItem>
  );

  return (
    <nav aria-label="Jobs" className="job-rail">
      <Stack gap="normal">
        <Input
          size="sm"
          aria-label="Search jobs"
          placeholder="Search jobs…"
          value={view.q}
          onChange={(e) => setPipelineView({ q: e.target.value })}
          leadingVisual={<Search size={16} />}
        />
        <Text variant="caption" as="p" tone="secondary">
          {FILTER_LABEL[view.filter]} · {shown.length} {shown.length === 1 ? 'job' : 'jobs'}
        </Text>
        <Text variant="caption" as="p" tone="secondary">
          <InlineLink href="#/queue" externalIcon={false}>
            Change filters
          </InlineLink>
        </Text>
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
  );
}
