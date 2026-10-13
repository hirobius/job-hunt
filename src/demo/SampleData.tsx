// "Try with sample data" (#107): the empty-Tracker button that loads the fictional pipeline, and
// the banner that stays up while any sample record exists. Pure HDS + tokens (no src/ui), so it
// adds nothing to the src/ui retirement (#92) or the brand move (#91).
import { Button, Text } from '@hirobius/design-system';
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
  // A one-line notice strip (not a striped callout): it says what the data is and offers the
  // way out, then gets out of the way of the list.
  return (
    <div
      role="status"
      aria-label="Sample data"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--primitive-space-3)',
        marginBlockEnd: 'var(--primitive-space-3)',
        padding: 'var(--primitive-space-2) var(--primitive-space-3)',
        borderRadius: 8,
        border: '1px solid var(--semantic-color-border-subtle)',
        background: 'var(--semantic-color-feedback-bg-info)',
      }}
    >
      <Text variant="ui" as="span">
        <strong>Sample data</strong> · {n} fictional {n === 1 ? 'job' : 'jobs'}
      </Text>
      <Button variant="tertiary" size="sm" onClick={() => clearSample()}>
        Clear sample data
      </Button>
    </div>
  );
}
