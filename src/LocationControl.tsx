// The shared location + work-mode control for every generated search in Discover (Title search,
// ATS search, Live postings). It lives once, in the Discover header's context popover
// (DiscoverHeader), and each tool shows a one-line `ContextCaption` of what it inherited.
import { Input as HdsInput, SegmentedControl, Box, Text } from '@hirobius/design-system';
import type { WorkMode } from './jobsData';
import { contextLabel, useTrackContext } from './discoverContext';

const REMOTE_COMPETITION_HINT =
  'Remote roles draw ~5× the applicants (2024) — local & hybrid compete less.';

// Location lives on the track, work mode on the device (src/discoverContext.ts).
export default function LocationControl({ categoryId }: { categoryId: string }) {
  const { where, mode, setWhere: onWhere, setMode: onMode } = useTrackContext(categoryId);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'xs' }}>
      <SegmentedControl
        aria-label="Work mode"
        size="sm"
        value={mode}
        onChange={(v) => onMode(v as WorkMode)}
        options={[
          { value: 'any', label: 'Any' },
          { value: 'remote', label: 'Remote' },
          { value: 'hybrid', label: 'Hybrid' },
          { value: 'onsite', label: 'On-site' },
        ]}
      />
      <Box sx={{ '& > *': { width: '100%' } }}>
        <HdsInput
          size="sm"
          aria-label="Location"
          placeholder="City, State — blank = anywhere"
          value={mode === 'remote' ? '' : where}
          disabled={mode === 'remote'}
          onChange={(e) => onWhere(e.target.value)}
        />
      </Box>
      {mode === 'remote' && (
        <Text variant="caption" as="span" tone="secondary">
          {REMOTE_COMPETITION_HINT}
        </Text>
      )}
    </Box>
  );
}

/** "Searching in Spokane, Hybrid" — makes the inherited setting visible where it is used. */
export function ContextCaption({ categoryId }: { categoryId: string }) {
  const { where, mode } = useTrackContext(categoryId);
  return (
    <Box sx={{ mb: 'xs' }}>
      <Text variant="caption" as="div" tone="secondary">
        Searching in {contextLabel(where, mode)}
      </Text>
    </Box>
  );
}
