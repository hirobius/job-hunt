// The top of the Pipeline (rapid apply): "To apply" with the one primary Start applying, then
// the agenda (#236, was Today): "Follow up", due ones first, and the next 7 days of interviews
// and calls. Sections with nothing in them render nothing. Rev-3 mock: each is a panel
// (PipelinePanel) with its count as a Badge.
import { useMemo } from 'react';
import { Button, Stack, Text } from '@hirobius/design-system';
import { toApplyQueue } from './applyQueue';
import { jobIdOf } from './store';
import { openApply } from './route';
import { lastApplyJobId } from './tabMemory';
import { FollowUpSection, NextDaysSection } from './PipelineAgenda';
import { Panel, PanelBody } from './PipelinePanel';
import type { Job } from './types';

const jobs$ = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;

export default function ApplyQueueSummary({ jobs }: { jobs: Job[] }) {
  const queue = useMemo(() => toApplyQueue(jobs), [jobs]);
  const now = new Date();
  // Back from Apply mode at "2 of 3": Start applying picks up there (return paths).
  const lastId = lastApplyJobId();
  const resumeAt = lastId ? queue.findIndex((j) => jobIdOf(j.url) === lastId) : -1;
  const start = queue[Math.max(0, resumeAt)];
  return (
    <>
      <Panel
        label={`To apply (${queue.length})`}
        title="To apply"
        count={queue.length}
        countLabel={jobs$(queue.length)}
      >
        <PanelBody>
          <Stack gap="normal" align="start">
            <Text variant="caption" as="p" tone="secondary">
              {queue.length
                ? 'Starred first, then newest.'
                : 'Nothing waiting. Save jobs from Companies to fill it.'}
            </Text>
            <Button
              variant="primary"
              disabled={!queue.length}
              onClick={() => start && openApply(jobIdOf(start.url))}
            >
              {resumeAt > 0
                ? `Resume applying (${resumeAt + 1} of ${queue.length})`
                : 'Start applying'}
            </Button>
          </Stack>
        </PanelBody>
      </Panel>
      <FollowUpSection jobs={jobs} now={now} />
      <NextDaysSection jobs={jobs} now={now} />
    </>
  );
}
