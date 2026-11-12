// The To apply view's done state (redesign §5.11, #554): the live flame, "That is the list", one line
// for the week, then one filled key for the next step and the grey All jobs key. On the page
// background, never in a card (#553). The flame is BootHold's: flame.svg still at once, set burning
// by the lazy startFlame chunk; still under reduced motion and Pause animations.
import { Button, Stack, Text } from '@hirobius/design-system';
import { Flame } from './brand/Flame';
import { navigate } from './route';
import { setPipelineView } from './pipelineView';
import { nextStep, weekLine } from './applyDone';
import { focusNewHeading, pageHeadingNow } from './focusRescue';
import type { Job } from './types';

/** The flame's size: the app bar logo's variable (base.css `.rjb-flame svg`, 1.5 of it tall). */
const FLAME_SIZE = '32px';

export const DONE_TITLE = 'That is the list';

export default function ApplyDone({ jobs }: { jobs: Job[] }) {
  const next = nextStep(jobs);
  return (
    <Stack as="section" aria-label={DONE_TITLE} gap="xs" align="center" data-done="">
      <span ref={(el) => el?.style.setProperty('--rjb-logo-size', FLAME_SIZE)}>
        <Flame animate />
      </span>
      <Stack gap="px4" align="center" className="text-center">
        <Text as="h2" variant="body" weight="bold">
          {DONE_TITLE}
        </Text>
        <Text as="p" variant="caption" tone="secondary">
          {weekLine(jobs)}
        </Text>
      </Stack>
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
    </Stack>
  );
}
