// "Try with sample data" (#107): the empty-Tracker button that loads the fictional pipeline, and
// the banner that stays up while any sample record exists. Pure HDS + tokens (no src/ui), so it
// adds nothing to the src/ui retirement (#92) or the brand move (#91).
import { Box, Button, Stack, Text } from '@hirobius/design-system';
import { navigate } from '../route';
import type { Job } from '../types';
import { importFresh } from '../staleBuild';
import { clearSample, hasCloudSession } from './sampleSession';
import { isSample } from './isSample';

// Seeding takes a starter pack: loaded on the click, not with the Pipeline (#372).
const loadSampleModule = importFresh(() => import('./loadSample'));
let seeding = false;

/** Offered only in an empty tracker (the mount decides) and never while signed in, since a
 *  signed-in tracker syncs; loads the sample on click and shows it in the Pipeline. */
export function TrySampleButton({
  size = 'md',
  link = false,
}: {
  size?: 'sm' | 'md';
  /** A quiet underlined inline link (onboarding's "Just looking?"), not a bordered button. */
  link?: boolean;
}) {
  if (hasCloudSession()) return null;
  return (
    <Button
      variant={link ? 'tertiary' : 'secondary'}
      size={size}
      className={link ? 'rjb-inline-link' : undefined}
      onClick={() => {
        if (seeding) return; // one seed per click, however slow the chunk
        seeding = true;
        const from = window.location.hash;
        void loadSampleModule()
          .then(({ loadSample }) => {
            // A sign-in may have landed while the chunk loaded: never seed into an account.
            if (hasCloudSession()) return;
            loadSample();
            // Show it in the Pipeline, unless the user has moved on meanwhile.
            if (window.location.hash === from) navigate({ tab: 'queue', sub: null, jobId: null });
          })
          .catch(() => {})
          .finally(() => {
            seeding = false;
          });
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
    <Box role="status" aria-label="Sample data">
      {/* One quiet line (rev-3 mock): what it is, and Clear. */}
      <Stack direction="row" wrap="wrap" gap="px4" align="center">
        <Text variant="caption" as="span" tone="secondary">
          Sample data, {n} fictional {n === 1 ? 'job' : 'jobs'}.
        </Text>
        {/* An inline link right after the sentence (rev-3 mock): HDS InlineLink is href-only, so a
            tertiary Button styled as a link (.rjb-inline-link) keeps the button semantics. */}
        <Button
          variant="tertiary"
          size="sm"
          className="rjb-inline-link"
          label="Clear sample data"
          title="Clearing removes them and any edits to them"
          onClick={() => clearSample()}
        >
          Clear
        </Button>
      </Stack>
    </Box>
  );
}
