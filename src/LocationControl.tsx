// The ONE shared work-mode + location block for every generated search in Discover (Search by
// title, Search by company board, Postings) — v1. Extracted so each view reuses it unchanged.
import { Input as HdsInput, SegmentedControl, Stack, Text } from '@hirobius/design-system';
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
    <Stack gap="tight">
      <SegmentedControl
        aria-label="Work mode"
        size="sm"
        fullWidth
        value={mode}
        onChange={(v) => onMode(v as WorkMode)}
        options={[
          { value: 'any', label: 'Any' },
          { value: 'remote', label: 'Remote' },
          { value: 'hybrid', label: 'Hybrid' },
          { value: 'onsite', label: 'On-site' },
        ]}
      />
      <HdsInput
        size="sm"
        label="Location (optional)"
        placeholder="City or State — leave blank for anywhere"
        value={mode === 'remote' ? '' : where}
        disabled={mode === 'remote'}
        onChange={(e) => onWhere(e.target.value)}
        style={{ width: '100%' }}
      />
      {mode === 'remote' && (
        <Text
          variant="caption"
          as="span"
          style={{ color: 'var(--semantic-color-content-secondary)' }}
        >
          {REMOTE_COMPETITION_HINT}
        </Text>
      )}
    </Stack>
  );
}
