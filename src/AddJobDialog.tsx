// Add job (redesign §5.10, #551): one field and one filled key. Paste a job link; the grey key
// turns the dialog into the Find box (#384) for a company or title. Below sm a bottom sheet with
// Add job at full width; from sm HDS's centred dialog with Add job at the right. There is no
// Cancel key: Close (the dialog's X), Escape, the scrim and the browser's Back cancel.
// Its own component, so any host can open it (the Add job button here; the All jobs sheet, #543).
// A Dialog set as a bottom sheet in place of HDS Sheet (G2: a Sheet build that fits the entry).
// hds-gap: hirobius/hds#1433 (G2)
import { lazy, Suspense, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Form } from '@hirobius/design-system/patterns';
import { Button, Input, Dialog, Box, Stack } from '@hirobius/design-system';
import { saveWithNotice } from './saveNotice';
import { importFresh } from './staleBuild';
import { useVisualViewportVars } from './hds-gaps/useVisualViewportVars';
import { useBackCloses } from './useBackCloses';
import './hds-gaps/BottomSheet.css';
import './AddJobDialog.css';

// The Find box (#384) loads when Add job turns into it: the board probe stays out of the Pipeline.
const loadFindBox = importFresh(() => import('./FindBox'));
const FindBox = lazy(loadFindBox);

export const ADD_JOB_HELPER = 'The title fills in from the link. You can edit it after.';
export const FIND_INSTEAD = 'Type a company or title instead';

export function AddJobDialog({
  open,
  onOpenChange,
  opener,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The control that opened it: focus goes back there on close (it has no Dialog.Trigger). */
  opener?: RefObject<HTMLElement | null>;
}) {
  const [url, setUrl] = useState('');
  // Said under the field (QA): an empty or unreadable link keeps the dialog open and says why.
  const [urlError, setUrlError] = useState<string | null>(null);
  // The dialog can turn into the Find box (#384): a company or title too.
  const [findMode, setFindMode] = useState(false);
  const urlField = useRef<HTMLInputElement>(null);
  // The sheet sits above the phone keyboard (--rjb-vv-bottom), so it never covers the field.
  const sheetRef = useVisualViewportVars<HTMLDivElement>();
  const change = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setUrlError(null);
      setFindMode(false);
    }
  };
  // The browser's Back closes the sheet and stays on the page (return paths).
  useBackCloses(open, () => change(false), 'add-job');
  // Add job is never greyed out (rev-3): an empty or unreadable link gets a field error instead,
  // and the dialog stays open. A link already saved closes it; saveWithNotice says so.
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const link = url.trim();
    if (!link) return setUrlError('Paste a job link');
    if (saveWithNotice(link) === 'invalid')
      return setUrlError('Paste the full link to the posting, like https://…');
    setUrl('');
    change(false);
  };

  return (
    // Portals out, so it takes no slot in the page's rhythm.
    <Dialog open={open} onOpenChange={change}>
      <Dialog.Content
        ref={sheetRef}
        className="rjb-bottom-sheet rjb-add-job"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          // Fetch the Find box now, so turning into it never leaves the dialog empty.
          void loadFindBox().catch(() => undefined);
          e.preventDefault();
          urlField.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          const back = opener?.current;
          if (!back?.isConnected) return;
          e.preventDefault();
          back.focus();
        }}
      >
        <Dialog.Header>
          <span className="rjb-sheet-handle" aria-hidden="true" />
          <Dialog.Title>{findMode ? 'Find' : 'Add a job'}</Dialog.Title>
        </Dialog.Header>
        {findMode ? (
          <Suspense fallback={null}>
            <FindBox initial={url} autoFocus onDone={() => change(false)} />
          </Suspense>
        ) : (
          <Form noValidate onSubmit={submit}>
            <Stack gap="normal">
              <Input
                ref={urlField}
                label="Job link"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="Job link"
                value={url}
                helperText={ADD_JOB_HELPER}
                error={!!urlError}
                errorMessage={urlError ?? undefined}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (urlError) setUrlError(null);
                }}
              />
              {/* Phone: the full-width filled key over the grey one. From sm one row, Add job
                  right-most. Add job comes first in the DOM either way. */}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { base: 'column', sm: 'row-reverse' },
                  gap: 'xs',
                }}
              >
                <Button type="submit" variant="primary">
                  Add job
                </Button>
                {/* One Find box (#384): the same dialog takes a company or a title. */}
                <Button variant="secondary" onClick={() => setFindMode(true)}>
                  {FIND_INSTEAD}
                </Button>
              </Box>
            </Stack>
          </Form>
        )}
      </Dialog.Content>
    </Dialog>
  );
}
