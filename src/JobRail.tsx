// The job page's list rail at lg and up (#130): the jobs the Pipeline list showed, as short links
// with the open one marked, on one filled card (roomy: its hover and selected fills read in both
// themes). It reads the Pipeline's shared filter and sort (pipelineView); only the search is
// editable here, and "Change filters" goes back to the list. A row is the title, "Company · Status"
// and a warning badge only when one applies; the full badge row lives on the job page's header.
import { Search } from 'lucide-react';
import { Badge, Box, Card, Input, InlineLink, NavList, Stack, Text } from '@hirobius/design-system';
import { useJobs, jobIdOf } from './store';
import { jobHash } from './route';
import { rowView } from './jobRow';
import { normStatus } from './jobState';
import { metaLines } from './metaLines';
import { checkFor, useLiveness } from './livenessStore';
import { FILTER_LABEL, setPipelineView, usePipelineView, visibleJobs } from './pipelineView';
import type { Job } from './types';
import './JobRail.css';

function RowBody({ job }: { job: Job }) {
  const v = rowView(job);
  const closed = checkFor(useLiveness(), job.url)?.state === 'closed';
  return (
    <Stack gap="px4">
      {/* Only what needs attention gets a badge, above the title (rev-3 B). */}
      {(v.followUp?.due || closed) && (
        <Stack direction="row" wrap="wrap" gap="px8" align="center">
          {v.followUp?.due && <Badge tone="warning">Follow-up due</Badge>}
          {closed && <Badge tone="warning">Closed on the board</Badge>}
        </Stack>
      )}
      <Box sx={{ overflowWrap: 'anywhere' }}>
        <Text variant="ui" as="div" className="rjb-semibold rjb-clamp-2">
          {v.title}
        </Text>
      </Box>
      {metaLines([v.retired ? 'Retired' : '', job.company, normStatus(job.status)]).map(
        (line, i) => (
          <Text key={i} variant="caption" as="span" tone="secondary">
            {line}
          </Text>
        ),
      )}
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

  // Rows are links (each job has its own route), so NavList's link mode, not its select mode.
  const item = (j: Job) => (
    <NavList.Item key={j.url} href={jobHash(jobIdOf(j.url))} current={jobIdOf(j.url) === openId}>
      <RowBody job={j} />
    </NavList.Item>
  );

  return (
    <Card as="nav" aria-label="Jobs" className="job-rail border-0" padding="item">
      {/* Search, 12 to the filter line, 16 to the list. */}
      <Stack gap="px16">
        <Stack gap="medium">
          <Input
            aria-label="Search jobs"
            placeholder="Search jobs…"
            value={view.q}
            onChange={(e) => setPipelineView({ q: e.target.value })}
            leadingVisual={<Search size={16} />}
          />
          {/* The filter on the left, Change filters on the right: one caption line. */}
          <Stack direction="row" gap="px8" align="center" justify="space-between" wrap="wrap">
            <Text variant="caption" as="p" tone="secondary">
              {FILTER_LABEL[view.filter]} · {shown.length} {shown.length === 1 ? 'job' : 'jobs'}
            </Text>
            <Text variant="caption" as="p" tone="secondary">
              <InlineLink href="#/queue" externalIcon={false}>
                Change filters
              </InlineLink>
            </Text>
          </Stack>
        </Stack>
        {hidden && open && (
          <Stack gap="px8">
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
    </Card>
  );
}
