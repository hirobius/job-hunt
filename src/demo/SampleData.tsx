// "Try with sample data" (#107): the empty-Tracker button that loads the fictional pipeline. Its
// Clear is the Account menu's "Clear sample data" (AccountMenuRows, bare list 2026-11-13). Pure HDS + tokens (no src/ui), so it
// adds nothing to the src/ui retirement (#92) or the brand move (#91).
import { Button } from '@hirobius/design-system';
import { navigate } from '../route';
import { importFresh } from '../staleBuild';
import { hasCloudSession } from './sampleSession';

// Seeding takes a starter pack: loaded on the click, not with the Pipeline (#372).
const loadSampleModule = importFresh(() => import('./loadSample'));
let seeding = false;

/** Offered only in an empty tracker (the mount decides) and never while signed in, since a
 *  signed-in tracker syncs; loads the sample on click and shows it in the Pipeline. */
export function TrySampleButton({
  size = 'md',
  link = false,
  onLoaded,
}: {
  size?: 'sm' | 'md';
  /** Called once the sample is in: the button leaves with the empty state, so the mount moves
   *  focus (#345). */
  onLoaded?: () => void;
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
            if (window.location.hash === from) navigate({ tab: 'apply', sub: null, jobId: null });
            onLoaded?.();
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
