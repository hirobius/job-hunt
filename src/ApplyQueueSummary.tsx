// The top of the Pipeline (rapid apply): "To apply" with the one primary Start applying. The agenda
// under it (Follow up, Next 7 days) is PipelineAgenda; TrackerView lays the sections out. Roomy
// layout: a section label with its count, over one filled card.
import { useMemo } from 'react';
import { Box, Button, Text } from '@hirobius/design-system';
import { toApplyQueue } from './applyQueue';
import { jobIdOf } from './store';
import { openApply } from './route';
import { Panel } from './PipelinePanel';
import type { Job } from './types';

const jobs$ = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;

export default function ToApply({ jobs }: { jobs: Job[] }) {
  const queue = useMemo(() => toApplyQueue(jobs), [jobs]);
  return (
    <Panel
      label={`To apply (${queue.length})`}
      title="To apply"
      count={queue.length}
      countLabel={jobs$(queue.length)}
    >
      {/* The caption and Start applying stack 12 apart on a phone and share a row from sm,
          caption left, button right. */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { base: 'column', sm: 'row' },
          alignItems: { base: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          gap: 'fixed-xs',
        }}
      >
        <Text variant="caption" as="p" tone="secondary">
          {queue.length
            ? 'Pinned first, then newest.'
            : 'Nothing waiting. Save jobs from Companies to fill it.'}
        </Text>
        <Button
          variant="primary"
          disabled={!queue.length}
          onClick={() => queue[0] && openApply(jobIdOf(queue[0].url))}
        >
          Start applying
        </Button>
      </Box>
    </Panel>
  );
}
