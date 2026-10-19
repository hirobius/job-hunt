// "Try with sample data" (#107): the empty-Tracker button that loads the fictional pipeline, and
// the banner that stays up while any sample record exists. Pure HDS + tokens (no src/ui), so it
// adds nothing to the src/ui retirement (#92) or the brand move (#91).
import { Box, Button, Stack, Text } from '@hirobius/design-system';
import { navigate } from '../route';
import { SECONDARY } from '../hds-gaps/tone';
import type { Job } from '../types';
import { clearSample, hasCloudSession, loadSample } from './loadSample';
import { isSample } from './sampleData';

/** Offered only in an empty tracker (the mount decides) and never while signed in, since a
 *  signed-in tracker syncs; loads the sample on click and shows it in the Pipeline. */
export function TrySampleButton() {
  if (hasCloudSession()) return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        loadSample();
        navigate({ tab: 'queue', sub: null, jobId: null });
      }}
    >
      Try with sample data
    </Button>
  );
}

/** Visible while the tracker holds sample records; Clear removes exactly those. A one-line note
 *  under the page header (#133), not a full-width band. */
export function SampleBanner({ jobs }: { jobs: Job[] }) {
  const n = jobs.filter(isSample).length;
  if (n === 0) return null;
  return (
    <Box role="status" aria-label="Sample data" sx={{ marginBlockEnd: 'sm' }}>
      <Stack direction="row" wrap="wrap" gap="px8" align="center">
        <Text variant="caption" as="span" style={SECONDARY}>
          <span className="rjb-semibold">Sample data</span> · {n} fictional{' '}
          {n === 1 ? 'job' : 'jobs'}. Clearing removes them and any edits to them.
        </Text>
        <Button variant="tertiary" size="sm" onClick={() => clearSample()}>
          Clear sample data
        </Button>
      </Stack>
    </Box>
  );
}
