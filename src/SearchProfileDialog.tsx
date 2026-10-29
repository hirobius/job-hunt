// The Account menu's Search profile (simplify 7/11, #388): the onboarding form's fields (job
// titles, remote only or a place, the words to leave out) for the profile in use, saved on Save.
// It takes Calibrate's and Manage track's place for what the Feed searches for. With no profile
// yet, Save makes one the way onboarding does. Its own chunk (lazyDialogs.ts).
import { useState } from 'react';
import { Button, Dialog, Stack } from '@hirobius/design-system';
import { saveProfile, useProfile } from './profile';
import { TitlesField, WhereFields } from './Onboarding';
import { NEW_PROFILE, draftOf, fieldsOf, finishSetup, type ProfileDraft } from './searchDefaults';
import { showNotice } from './saveNotice';

export default function SearchProfileDialog({
  onDone,
  onCloseAutoFocus,
}: {
  onDone: () => void;
  onCloseAutoFocus?: () => void;
}) {
  const profile = useProfile();
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    profile ? draftOf(profile) : NEW_PROFILE,
  );
  const [titleError, setTitleError] = useState(false);
  const change = (c: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...c }));
  const save = () => {
    if (!draft.titles.length) return setTitleError(true);
    if (profile) saveProfile(fieldsOf(draft));
    else finishSetup(draft);
    showNotice({ title: 'Search profile saved', tone: 'success', actions: [] });
    onDone();
  };
  return (
    <Dialog.Content className="rjb-dialog" onCloseAutoFocus={onCloseAutoFocus}>
      <Dialog.Header>
        <Dialog.Title>Search profile</Dialog.Title>
        <Dialog.Description>What Review new and the scan look for.</Dialog.Description>
      </Dialog.Header>
      <Stack gap="px24">
        <TitlesField
          titles={draft.titles}
          onChange={(titles) => {
            setTitleError(false);
            change({ titles });
          }}
          error={titleError && !draft.titles.length}
        />
        <WhereFields draft={draft} onChange={change} />
      </Stack>
      <Dialog.Footer>
        <Dialog.Close asChild>
          <Button variant="secondary">Cancel</Button>
        </Dialog.Close>
        <Button variant="primary" onClick={save}>
          Save
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  );
}
