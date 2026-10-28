// The top of the Pipeline (rapid apply): "To apply" with the one primary Start applying, then
// the agenda (#236, was Today): "Follow up", due ones first, and the next 7 days of interviews
// and calls. Sections with nothing in them render nothing. Rev-3 mock: each is a panel
// (PipelinePanel) with its count as a Badge.
import { useMemo } from 'react';
import { AvatarGroup, Box, Button, Stack, Text } from '@hirobius/design-system';
import { toApplyQueue } from './applyQueue';
import { jobIdOf } from './store';
import { openApply } from './route';
import { lastApplyJobId } from './tabMemory';
import { FollowUpSection, NextDaysSection } from './PipelineAgenda';
import { Panel, PanelBody } from './PipelinePanel';
import CompanyLogo from './CompanyLogo';
import { useAgendaNow } from './useAgendaNow';
import type { Job } from './types';

const jobs$ = (n: number) => `${n} ${n === 1 ? 'job' : 'jobs'}`;

export default function ApplyQueueSummary({ jobs }: { jobs: Job[] }) {
  const queue = useMemo(() => toApplyQueue(jobs), [jobs]);
  // Re-read at midnight and on return to the tab, so the agenda never shows yesterday (#309).
  const now = useAgendaNow();
  // Every distinct company waiting, one mark each (their logos, else their letters); the group
  // shows 3 and "+N" for the rest.
  const waiting: Job[] = [];
  for (const j of queue) {
    const name = j.company?.trim().toLowerCase();
    if (name && !waiting.some((w) => w.company?.trim().toLowerCase() === name)) waiting.push(j);
  }
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
        trailing={
          waiting.length > 0 && (
            // Zero height, centred on the title row: the marks never make this header taller than
            // the other panels'.
            <Box sx={{ height: 0, display: 'flex', alignItems: 'center', overflow: 'visible' }}>
              <AvatarGroup size="sm" max={3} aria-hidden>
                {waiting.map((j) => (
                  <CompanyLogo key={j.url} company={j.company} postings={[j.url]} />
                ))}
              </AvatarGroup>
            </Box>
          )
        }
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
