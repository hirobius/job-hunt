// The Account menu's Search profile (simplify 7/11, #388): the profile's fields (job
// titles, remote only or a place, the words to leave out) for the profile in use, saved on Save.
// It takes Calibrate's and Manage track's place for what the Feed searches for. With no profile
// yet, Save makes one the way a first run does. Its own chunk (lazyDialogs.ts).
import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Spinner, Stack, Text } from '@hirobius/design-system';
import { useCloudSync } from './account/accountContext';
import { hasCloudSession } from './demo/loadSample';
import { saveProfile, useProfile } from './profile';
import { TitlesField, WhereFields } from './ProfileFields';
import { NEW_PROFILE, draftOf, fieldsOf, finishSetup, type ProfileDraft } from './searchDefaults';
import { showNotice } from './saveNotice';
import { ExitButton } from './hds-gaps/ExitButton';

export default function SearchProfileDialog({
  onDone,
  onCloseAutoFocus,
}: {
  onDone: () => void;
  onCloseAutoFocus?: () => void;
}) {
  const profile = useProfile();
  const { settled } = useCloudSync();
  const [draft, setDraft] = useState<ProfileDraft>(() =>
    profile ? draftOf(profile) : NEW_PROFILE,
  );
  // Until the person edits, the form follows the stored profile (a pull that lands after the
  // dialog opened), so Save never writes the defaults over a profile it hadn't shown.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setDraft(profile ? draftOf(profile) : NEW_PROFILE);
  }, [profile]);
  const [titleError, setTitleError] = useState(false);
  const change = (c: Partial<ProfileDraft>) => {
    touched.current = true;
    setDraft((d) => ({ ...d, ...c }));
  };
  // Signed in, a pull may be about to bring the profile: wait for it.
  const waiting = hasCloudSession() && !settled;
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
        <Dialog.Description>What Review on Find and the scan look for.</Dialog.Description>
      </Dialog.Header>
      {waiting ? (
        <Stack direction="row" gap="normal" align="center">
          <Spinner size="sm" />
          <Text variant="body">Restoring your search…</Text>
        </Stack>
      ) : (
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
      )}
      <Dialog.Footer>
        <Dialog.Close asChild>
          <ExitButton>Cancel</ExitButton>
        </Dialog.Close>
        <Button variant="primary" onClick={save} disabled={waiting}>
          Save
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  );
}
