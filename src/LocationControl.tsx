// The shared location + work-mode control for every generated search in Discover (Title search,
// ATS search, Live postings). Extracted from DiscoverView so the Live postings panel can reuse it.
import { Input as HdsInput, SegmentedControl } from '@hirobius/design-system';
import { Box, Stack, Typography } from './ui/box';
import type { WorkMode } from './jobsData';

const REMOTE_COMPETITION_HINT =
  'Remote roles draw ~5× the applicants (2024) — local & hybrid compete less.';

export default function LocationControl({
  where,
  mode,
  onWhere,
  onMode,
}: {
  where: string;
  mode: WorkMode;
  onWhere: (v: string) => void;
  onMode: (v: WorkMode) => void;
}) {
  return (
    <Stack spacing={1} sx={{ mb: 1.5 }}>
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
      <Box sx={{ maxWidth: 280, '& > *': { width: '100%' } }}>
        <HdsInput
          size="sm"
          aria-label="Location"
          placeholder="City, State — blank = anywhere"
          value={mode === 'remote' ? '' : where}
          disabled={mode === 'remote'}
          onChange={(e) => onWhere(e.target.value)}
          style={{ width: '100%' }}
        />
      </Box>
      {mode === 'remote' && (
        <Typography variant="caption" color="text.secondary">
          {REMOTE_COMPETITION_HINT}
        </Typography>
      )}
    </Stack>
  );
}
