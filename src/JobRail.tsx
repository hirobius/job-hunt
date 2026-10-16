// The job page's list rail at lg and up (#130): the jobs the Pipeline list showed, as compact
// links, with the open one marked. It reads the Pipeline's shared filter and sort (pipelineView);
// only the search is editable here, and "Change filters" goes back to the list.
import { Search } from 'lucide-react';
import { Box, Input, InlineLink, Stack, Text, VisuallyHidden } from '@hirobius/design-system';
import { useJobs, jobIdOf } from './store';
import { jobHash } from './route';
import { rowView } from './jobRow';
import { StatusBadge } from './JobRowParts';
import { FILTER_LABEL, setPipelineView, usePipelineView, visibleJobs } from './pipelineView';
import RailList, { type RailItem } from './hds-gaps/RailList';
import type { Job } from './types';
import { SECONDARY } from './hds-gaps/tone';
import './JobRail.css';

function RowBody({ job }: { job: Job }) {
  const v = rowView(job);
  return (
    <Stack gap="tight">
      <Stack direction="row" gap="tight" align="start" justify="space-between">
        <Text variant="ui" as="span" className="rjb-semibold" style={{ overflowWrap: 'anywhere' }}>
          {v.title}
        </Text>
        <Stack direction="row" gap="tight" align="center">
          {v.followUp?.due && (
            <>
              <Box
                as="span"
                aria-hidden="true"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: 'feedback.warning',
                  flexShrink: 0,
                }}
              />
              <VisuallyHidden>Follow-up due</VisuallyHidden>
            </>
          )}
          <StatusBadge job={job} />
        </Stack>
      </Stack>
      {v.factLines.map((line) => (
        <Text key={line} variant="caption" as="span" style={SECONDARY}>
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

  const item = (j: Job): RailItem => ({
    id: j.url,
    href: jobHash(jobIdOf(j.url)),
    current: jobIdOf(j.url) === openId,
    children: <RowBody job={j} />,
  });

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
          style={{ width: '100%' }}
        />
        <Text variant="caption" as="p" style={SECONDARY}>
          {FILTER_LABEL[view.filter]} · {shown.length} {shown.length === 1 ? 'job' : 'jobs'} ·{' '}
          <InlineLink href="#/queue" externalIcon={false}>
            Change filters
          </InlineLink>
        </Text>
        {hidden && open && (
          <Stack gap="tight">
            <RailList items={[item(open)]} />
            <Text variant="caption" as="p" style={SECONDARY}>
              Not in this filter
            </Text>
          </Stack>
        )}
        {shown.length === 0 && !hidden ? (
          <Text variant="ui" as="p" style={SECONDARY}>
            No jobs match.
          </Text>
        ) : (
          <RailList items={shown.map(item)} />
        )}
      </Stack>
    </nav>
  );
}
