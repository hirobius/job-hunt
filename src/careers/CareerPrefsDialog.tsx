// The career preferences preview (ADR 0011, proposed): the Search profile dialog while
// careersFlag.ts is on. Categories, then title and skill chips, level, where, pay and leave out.
// Save writes a second profile behind the one in use (careers.ts `withPreview`), so the Feed, the
// scan and the server sync read the same search as before.
import { useId, useState } from 'react';
import {
  Button,
  Dialog,
  Input as HdsInput,
  SegmentedControl,
  Stack,
  Tag,
  Text,
  Toggle,
} from '@hirobius/design-system';
import { ChipEditor, FieldLabel } from '../ChipEditor';
import { ExitButton } from '../hds-gaps/ExitButton';
import { focusClose } from '../dialogFocus';
import { getProfiles, replaceProfiles, useProfiles, MAX_CATEGORIES } from '../profile';
import type { WorkMode } from '../profile';
import type { Seniority } from '../curation/types';
import { showNotice } from '../saveNotice';
import {
  CAREER_CATEGORIES,
  NEW_PREFS,
  PREVIEW_PROFILE_ID,
  prefsOf,
  skillChoices,
  titleChoices,
  toggleCategory,
  toggleValue,
  withPreview,
  type CareerPrefs,
} from './careers';

const TITLE_ERROR = 'Pick or add at least one job title.';
const NO_ROOM = 'The preview could not be saved on this account. Nothing was changed.';
const has = (list: string[], v: string) => list.some((x) => x.toLowerCase() === v.toLowerCase());

const LEVELS: { value: Seniority; label: string }[] = [
  { value: 'any', label: 'Any level' },
  { value: 'entry', label: 'Entry' },
  { value: 'experienced', label: 'Experienced' },
];
const MODES: { value: WorkMode; label: string }[] = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
  { value: 'any', label: 'Any' },
];

/** A group of toggle chips with a field to add one of your own. */
function ChipPicker({
  label,
  hint,
  addLabel,
  choices,
  picked,
  onChange,
}: {
  label: string;
  hint: string;
  addLabel: string;
  choices: string[];
  picked: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const id = useId();
  const add = () => {
    const v = draft.trim();
    if (v && !has(picked, v)) onChange([...picked, v]);
    setDraft('');
  };
  return (
    <Stack gap="px8">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Text variant="caption" as="p" tone="secondary">
        {hint}
      </Text>
      {choices.length > 0 && (
        <Stack direction="row" wrap="wrap" gap="px8" role="group" aria-label={label}>
          {choices.map((c) => (
            <Tag
              key={c}
              active={has(picked, c)}
              aria-pressed={has(picked, c)}
              onClick={() => onChange(toggleValue(picked, c))}
            >
              {c}
            </Tag>
          ))}
        </Stack>
      )}
      <Stack direction="row" gap="px8" align="end">
        <HdsInput
          id={id}
          size="sm"
          aria-label={addLabel}
          placeholder={addLabel}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" size="sm" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </Stack>
    </Stack>
  );
}

export default function CareerPrefsDialog({
  onDone,
  onCloseAutoFocus,
}: {
  onDone: () => void;
  onCloseAutoFocus?: (e: Event) => void;
}) {
  const saved = useProfiles().find((p) => p.id === PREVIEW_PROFILE_ID);
  const [prefs, setPrefs] = useState<CareerPrefs>(() => (saved ? prefsOf(saved) : NEW_PREFS));
  const [titleError, setTitleError] = useState(false);
  const [noRoom, setNoRoom] = useState(false);
  const change = (c: Partial<CareerPrefs>) => setPrefs((p) => ({ ...p, ...c }));
  const full = prefs.categories.length >= MAX_CATEGORIES;

  const save = () => {
    if (!prefs.titles.length) return setTitleError(true);
    const all = getProfiles();
    const next = withPreview(all, prefs, new Date().toISOString());
    const kept = next.some((p) => p.id === PREVIEW_PROFILE_ID);
    // No profile in use yet, or a full list: nothing is written.
    if (!kept) return setNoRoom(true);
    replaceProfiles(next);
    showNotice({ title: 'Preferences saved', tone: 'success', actions: [] });
    onDone();
  };

  return (
    <Dialog.Content
      className="rjb-dialog"
      onOpenAutoFocus={focusClose}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <Dialog.Header>
        <Dialog.Title>Job preferences</Dialog.Title>
        <Dialog.Description>
          Preview. Your current search stays as it is until this ships.
        </Dialog.Description>
      </Dialog.Header>
      <Stack gap="px24" className="rjb-dialog-body">
        <Stack gap="px8">
          <Text variant="ui" as="h2" className="rjb-semibold">
            Kind of work
          </Text>
          <Text variant="caption" as="p" tone="secondary">
            {full
              ? `${MAX_CATEGORIES} picked. Remove one to pick another.`
              : `Pick up to ${MAX_CATEGORIES}.`}
          </Text>
          <Stack direction="row" wrap="wrap" gap="px8" role="group" aria-label="Kind of work">
            {CAREER_CATEGORIES.map((c) => {
              const on = prefs.categories.includes(c.id);
              return (
                <Tag
                  key={c.id}
                  active={on}
                  aria-pressed={on}
                  aria-disabled={!on && full}
                  onClick={() => change({ categories: toggleCategory(prefs.categories, c.id) })}
                >
                  {c.label}
                </Tag>
              );
            })}
          </Stack>
        </Stack>

        <Stack gap="px8">
          <ChipPicker
            label="Job titles"
            hint="Every source is searched for each title you pick."
            addLabel="Job title"
            choices={titleChoices(prefs.categories, prefs.titles)}
            picked={prefs.titles}
            onChange={(titles) => {
              setTitleError(false);
              change({ titles });
            }}
          />
          {titleError && !prefs.titles.length && (
            <Text variant="caption" as="p" role="alert" tone="danger">
              {TITLE_ERROR}
            </Text>
          )}
        </Stack>

        <ChipPicker
          label="Skills (optional)"
          hint="A posting that names your skills ranks higher."
          addLabel="Skill"
          choices={skillChoices(prefs.categories, prefs.skills)}
          picked={prefs.skills}
          onChange={(skills) => change({ skills })}
        />

        <SegmentedControl
          label="Level"
          fullWidth
          value={prefs.level}
          onChange={(v) => change({ level: v as Seniority })}
          options={LEVELS}
        />

        <Stack gap="px8">
          <SegmentedControl
            label="Where"
            fullWidth
            value={prefs.mode}
            onChange={(v) => change({ mode: v as WorkMode })}
            options={MODES}
          />
          {prefs.mode !== 'remote' && (
            <HdsInput
              label="City, state or region"
              placeholder="City, state or region"
              helperText="Optional. Leave it blank to search anywhere."
              value={prefs.location}
              onChange={(e) => change({ location: e.target.value })}
            />
          )}
        </Stack>

        <Stack gap="px8">
          <HdsInput
            label="Lowest yearly pay (optional)"
            placeholder="Lowest yearly pay"
            inputMode="numeric"
            prefix="$"
            helperText="Used only where a posting states its pay."
            value={prefs.pay}
            onChange={(e) => change({ pay: e.target.value })}
          />
          {prefs.pay.trim() !== '' && (
            <Toggle
              label="Hide postings that state no pay"
              checked={prefs.payOnly}
              onChange={(on) => change({ payOnly: on })}
            />
          )}
        </Stack>

        <Stack gap="px8">
          <ChipEditor
            label="Leave out (optional)"
            placeholder="Word to leave out"
            values={prefs.leaveOut}
            onChange={(leaveOut) => change({ leaveOut })}
          />
          <Text variant="caption" as="p" tone="secondary">
            A posting that says one of these words is hidden.
          </Text>
        </Stack>
        {noRoom && (
          <Text variant="caption" as="p" role="alert" tone="danger">
            {NO_ROOM}
          </Text>
        )}
      </Stack>
      <Dialog.Footer>
        <Dialog.Close asChild>
          <ExitButton>Cancel</ExitButton>
        </Dialog.Close>
        <Button variant="primary" onClick={save}>
          Save
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  );
}
