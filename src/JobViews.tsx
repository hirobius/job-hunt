// The named views (#541, redesign phase 2): To apply, Follow up, This week, Interviewing, Applied,
// Recently closed, Passed, then All jobs. HDS Tags with a count, one picked at a time (no
// description line under them since 2026-11-13). They replace the Status select. Follow up's count is amber while a
// follow-up is due. Shared by the lg list column (at its top), the phone filter bar and the Jobs list.
import { useMemo } from 'react';
import { Badge, Stack, Tag } from '@hirobius/design-system';
import { useJobs } from './store';
import { decided } from './decided';
import { skippedPostings } from './passed';
import {
  FILTER_LABEL,
  VIEWS,
  filterCounts,
  setPipelineView,
  usePipelineView,
} from './pipelineView';

export default function JobViews() {
  const jobs = useJobs();
  const { filter, remoteOnly } = usePipelineView();
  const skipped = skippedPostings(decided.use().values()).length;
  // Counts follow Remote only (the Search profile's work mode), as the list does (#614).
  const counts = useMemo(
    () => filterCounts(jobs, undefined, !!remoteOnly, skipped),
    [jobs, remoteOnly, skipped],
  );
  return (
    <Stack direction="row" wrap="wrap" gap="px8" role="group" aria-label="Views">
      {VIEWS.map((f) => (
        <Tag
          key={f}
          active={f === filter}
          aria-pressed={f === filter}
          // The name says what is shown, label then count (axe label-content-name-mismatch).
          aria-label={`${FILTER_LABEL[f]} ${counts[f]}`}
          onClick={() => setPipelineView({ filter: f })}
        >
          <Stack as="span" direction="row" gap="px8" align="center">
            {FILTER_LABEL[f]}{' '}
            <Badge
              count={counts[f]}
              tone={f === 'followUp' && counts[f] > 0 ? 'warning' : undefined}
            />
          </Stack>
        </Tag>
      ))}
    </Stack>
  );
}
