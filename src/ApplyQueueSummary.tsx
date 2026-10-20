// The top of the Pipeline (rapid apply): "To apply (N)" with the one primary Start applying, then
// the agenda (#236, was Today): "Follow up (M)", due ones first, and the next 7 days of interviews
// and calls. Sections with nothing in them render nothing. Calm list (#241): flat sections on the
// page, no cards; they stack 48 apart (HDS `spacious`).
import { useMemo } from 'react';
import { Box, Button, Stack, Text } from '@hirobius/design-system';
import { toApplyQueue } from './applyQueue';
import { jobIdOf } from './store';
import { openApply } from './route';
import { FollowUpSection, NextDaysSection } from './PipelineAgenda';
import { SECONDARY } from './hds-gaps/tone';
import type { Job } from './types';

export default function ApplyQueueSummary({ jobs }: { jobs: Job[] }) {
  const queue = useMemo(() => toApplyQueue(jobs), [jobs]);
  const now = new Date();
  return (
    <Stack gap="spacious">
      <Box as="section" aria-label={`To apply (${queue.length})`}>
        <Stack direction="row" wrap="wrap" gap="tight" align="center" justify="space-between">
          <Box>
            <Text variant="body" as="h3" className="rjb-semibold">
              {`To apply (${queue.length})`}
            </Text>
            <Text variant="caption" as="p" style={SECONDARY}>
              {queue.length
                ? 'Pinned first, then newest. Open each, paste from your kit, mark applied.'
                : 'Nothing waiting. Save jobs from Companies to fill it.'}
            </Text>
          </Box>
          <Button
            variant="primary"
            disabled={!queue.length}
            onClick={() => queue[0] && openApply(jobIdOf(queue[0].url))}
          >
            Start applying
          </Button>
        </Stack>
      </Box>
      <FollowUpSection jobs={jobs} now={now} />
      <NextDaysSection jobs={jobs} now={now} />
    </Stack>
  );
}
