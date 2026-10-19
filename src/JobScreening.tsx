// The job page's Screening tab (#130): the fit at a glance, the paste-a-JD screener inline, and
// the editor for every screening field.
import { Badge, Box, Stack, Text } from '@hirobius/design-system';
import { verdictTone, verdictLabel, modeLabel, blockerLabel } from './screening';
import { ScreeningEditor } from './ScreeningEditor';
import JdScreenPanel from './JdScreenPanel';
import type { Job } from './types';
import { SECONDARY } from './hds-gaps/tone';

/** Verdict, work mode and dealbreakers on one line. */
function FitLine({ job }: { job: Job }) {
  const has = job.verdict || job.mode || (job.blockers && job.blockers.length > 0);
  return (
    <Box role="group" aria-label="Fit summary">
      <Stack direction="row" wrap="wrap" gap="tight" align="center">
        {!has && (
          <Text variant="ui" style={SECONDARY}>
            Not screened yet. Paste the job description below, or set the fit yourself.
          </Text>
        )}
        {job.verdict && (
          <Badge tone={job.archived ? 'neutral' : verdictTone(job.verdict)}>
            {verdictLabel(job.verdict)}
          </Badge>
        )}
        {job.mode && <Badge tone="neutral">{modeLabel(job.mode)}</Badge>}
        {job.blockers?.map((b) => (
          <Badge key={b} tone="danger">
            {blockerLabel(b)}
          </Badge>
        ))}
        {job.screenedAt && (
          <Text variant="caption" as="span" style={SECONDARY}>
            Screened {new Date(job.screenedAt).toLocaleDateString()}
          </Text>
        )}
      </Stack>
    </Box>
  );
}

export default function JobScreening({ job }: { job: Job }) {
  return (
    <Stack gap="normal">
      <FitLine job={job} />
      <JdScreenPanel job={job} />
      <ScreeningEditor job={job} />
    </Stack>
  );
}
