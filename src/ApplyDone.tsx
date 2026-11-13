// The To apply view's done state (redesign §5.11, #554): the standard empty-state icon tile (no
// flame, Find controls 2026-11-13), "That is the list", one line for the week, then one filled key
// for the next step and the grey All jobs key. On the page background, never in a card (#553).
import { Button, Stack } from '@hirobius/design-system';
import { ListChecks } from 'lucide-react';
import { EmptyState } from './hds-gaps/EmptyState';
import { navigate } from './route';
import { setPipelineView } from './pipelineView';
import { nextStep, weekLine } from './applyDone';
import { focusNewHeading, pageHeadingNow } from './focusRescue';
import type { Job } from './types';

export const DONE_TITLE = 'That is the list';

export default function ApplyDone({ jobs }: { jobs: Job[] }) {
  const next = nextStep(jobs);
  return (
    <Stack as="section" aria-label={DONE_TITLE} data-done="">
      <EmptyState
        centered
        icon={ListChecks}
        title={DONE_TITLE}
        description={weekLine(jobs)}
        action={
          <Stack direction="row" wrap="wrap" gap="tight" justify="center">
            <Button
              variant="primary"
              onClick={() => {
                if (next.kind === 'find') return navigate({ tab: 'find', sub: null, jobId: null });
                const from = pageHeadingNow();
                setPipelineView({ filter: 'followUp', q: '' });
                focusNewHeading(from);
              }}
            >
              {next.label}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const from = pageHeadingNow();
                setPipelineView({ filter: 'all', q: '' });
                focusNewHeading(from);
              }}
            >
              All jobs
            </Button>
          </Stack>
        }
      />
    </Stack>
  );
}
