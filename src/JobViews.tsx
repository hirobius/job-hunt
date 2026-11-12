// The named views (#541, redesign phase 2): To apply, Follow up, Interviewing, Applied, Recently
// closed, then All jobs. HDS Tags with a count, one picked at a time; the open view's one-line
// description sits under them. They replace the Status select. Follow up's count is amber while a
// follow-up is due. Shared by the lg list column (at its top), the phone filter bar and the Jobs list.
import { useMemo } from 'react';
import { Badge, Stack, Tag, Text } from '@hirobius/design-system';
import { useJobs } from './store';
import {
  FILTER_LABEL,
  VIEW_DESCRIPTION,
  VIEWS,
  filterCounts,
  setPipelineView,
  usePipelineView,
} from './pipelineView';

export default function JobViews() {
  const jobs = useJobs();
  const { filter, remoteOnly } = usePipelineView();
  // Counts follow Remote only, as the list and status line do (#614).
  const counts = useMemo(() => filterCounts(jobs, undefined, !!remoteOnly), [jobs, remoteOnly]);
  return (
    <Stack gap="tight">
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
      <Text variant="caption" as="p" tone="secondary">
        {VIEW_DESCRIPTION[filter]}
      </Text>
    </Stack>
  );
}
