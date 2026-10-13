// "Try with sample data" (#107): the empty-Tracker button that loads the fictional pipeline, and
// the banner that stays up while any sample record exists. Pure HDS + tokens (no src/ui), so it
// adds nothing to the src/ui retirement (#92) or the brand move (#91).
import { Button, Callout, Cluster, Text } from '@hirobius/design-system';
import type { Job } from '../types';
import { clearSample, hasCloudSession, loadSample } from './loadSample';
import { isSample } from './sampleData';

/** Offered only in an empty tracker (the mount decides) and never while signed in, since a
 *  signed-in tracker syncs; loads the sample on click. */
export function TrySampleButton() {
  if (hasCloudSession()) return null;
  return (
    <Button variant="secondary" size="sm" onClick={() => loadSample()}>
      Try with sample data
    </Button>
  );
}

/** Visible while the tracker holds sample records; Clear removes exactly those. */
export function SampleBanner({ jobs }: { jobs: Job[] }) {
  const n = jobs.filter(isSample).length;
  if (n === 0) return null;
  return (
    <div style={{ marginBlockEnd: 'var(--semantic-space-component-gap)' }}>
      <Callout tone="info" role="status" aria-label="Sample data">
        <Cluster gap="tight" justify="space-between">
          <Text variant="body" as="span">
            <strong>Sample data</strong> · {n} fictional {n === 1 ? 'job' : 'jobs'}. Clear removes
            them, including any edits you made to them.
          </Text>
          <Button variant="tertiary" size="sm" onClick={() => clearSample()}>
            Clear sample data
          </Button>
        </Cluster>
      </Callout>
    </div>
  );
}
