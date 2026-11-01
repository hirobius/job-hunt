import { Input as HdsInput, Stack, Text, Toggle } from '@hirobius/design-system';
import { ChipEditor } from './ChipEditor';
import type { ProfileDraft } from './searchDefaults';

// The Search profile's fields (Account → Search profile): the job titles, then Remote only or a
// place, and the words to leave out. There is no first-run form (Adrian 2026-10-29): a new user
// gets the design-systems profile on its own (searchDefaults.ts `ensureProfile`).
const TITLE_ERROR = 'Add at least one job title.';

export function TitlesField({
  titles,
  onChange,
  error,
}: {
  titles: string[];
  onChange: (titles: string[]) => void;
  error?: boolean;
}) {
  return (
    <Stack gap="px8">
      <ChipEditor label="Job titles" placeholder="Job title" values={titles} onChange={onChange} />
      <Text variant="caption" as="p" tone="secondary">
        Every board and feed is searched for each title. A posting is listed when its title names a
        design system role.
      </Text>
      {error && (
        <Text variant="caption" as="p" role="alert" tone="danger">
          {TITLE_ERROR}
        </Text>
      )}
    </Stack>
  );
}

export function WhereFields({
  draft,
  onChange,
}: {
  draft: ProfileDraft;
  onChange: (change: Partial<ProfileDraft>) => void;
}) {
  return (
    <Stack gap="normal">
      <Stack gap="px8">
        <Toggle
          label="Remote only"
          checked={draft.remoteOnly}
          onChange={(on) => onChange({ remoteOnly: on })}
        />
        <Text variant="caption" as="p" tone="secondary">
          {draft.remoteOnly
            ? 'On-site and hybrid roles are counted, not listed.'
            : 'Remote, hybrid and on-site roles are all listed.'}
        </Text>
      </Stack>
      {!draft.remoteOnly && (
        <HdsInput
          label="City, state or region"
          placeholder="City, state or region"
          helperText="Optional. Leave it blank to search anywhere."
          value={draft.location}
          onChange={(e) => onChange({ location: e.target.value })}
        />
      )}
      <Stack gap="px8">
        <ChipEditor
          label="Leave out (optional)"
          placeholder="Word to leave out"
          values={draft.leaveOut}
          onChange={(leaveOut) => onChange({ leaveOut })}
        />
        <Text variant="caption" as="p" tone="secondary">
          A posting that says one of these words is hidden.
        </Text>
      </Stack>
    </Stack>
  );
}
