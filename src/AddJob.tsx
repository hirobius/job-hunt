// Add job (rev-3): a button and its dialog. Paste a job link; the dialog can turn into the Find box
// (#384) for a company, board or title. Used by the Pipeline's header and empty state, and by the
// job list column beside a job (#471).
import { lazy, Suspense, useRef, useState, type FormEvent } from 'react';
import { Form } from '@hirobius/design-system/patterns';
import { Plus } from 'lucide-react';
import { Button as UiButton, Input as HdsInput, Dialog, Box, Stack } from '@hirobius/design-system';
import { saveWithNotice } from './saveNotice';
import { importFresh } from './staleBuild';
import { useVisualViewportVars } from './hds-gaps/useVisualViewportVars';
import './account/sheet.css';
import { useBackCloses } from './useBackCloses';

// The Find box (#384) loads when Add job turns into it: the board probe stays out of the Pipeline.
const loadFindBox = importFresh(() => import('./FindBox'));
const FindBox = lazy(loadFindBox);

export default function AddJobButton({
  variant = 'secondary',
  size,
}: {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md';
}) {
  const [url, setUrl] = useState('');
  // Said under the field (QA): an empty or unreadable link keeps the dialog open and says why.
  const [urlError, setUrlError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  // The Add job dialog can turn into the Find box (#384): paste a company, board or title too.
  const [findMode, setFindMode] = useState(false);
  const urlField = useRef<HTMLInputElement>(null);
  // Pinned to the top of what the phone keyboard leaves visible, like Reset (sheet.css).
  const sheetRef = useVisualViewportVars<HTMLDivElement>();
  // The dialog opens from the header or the empty state, outside its Root, so it has no Trigger:
  // remember which button opened it and give focus back there on close (a11y pass).
  const addOpener = useRef<HTMLElement | null>(null);
  // The browser's Back closes the sheet and stays on the Pipeline (return paths).
  useBackCloses(addOpen, () => setAddOpen(false), 'add-job');
  // Add job is never greyed out (rev-3): an empty or unreadable link gets a field error instead,
  // and the dialog stays open. A link already saved closes it; saveWithNotice says so.
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const link = url.trim();
    if (!link) return setUrlError('Paste a job link');
    if (saveWithNotice(link) === 'invalid')
      return setUrlError('Paste the full link to the posting, like https://…');
    setUrl('');
    setAddOpen(false);
  };
  const onAddOpenChange = (open: boolean) => {
    setAddOpen(open);
    if (!open) {
      setUrlError(null);
      setFindMode(false);
    }
  };

  const addJobButton = (
    <UiButton
      variant={variant}
      size={size}
      iconLeft={<Plus size={16} />}
      onClick={(e) => {
        addOpener.current = e.currentTarget;
        setAddOpen(true);
      }}
    >
      Add job
    </UiButton>
  );

  return (
    <>
      {addJobButton}
      {/* Portals out, so it takes no slot in the page's rhythm. */}
      <Dialog open={addOpen} onOpenChange={onAddOpenChange}>
        {/* Placed like the other shell dialogs with a field (`.rjb-sheet`: Reset), so the
              phone keyboard never covers the field or Add job, with the 16px phone gutter (`.rjb-form-sheet`). The rev-3 mock has no close X and no
              description: Cancel closes, and the field says where the title comes from. */}
        <Dialog.Content
          ref={sheetRef}
          className="rjb-sheet rjb-form-sheet"
          hideClose
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => {
            // Fetch the Find box now, so turning into it never leaves the dialog empty.
            void loadFindBox().catch(() => undefined);
            e.preventDefault();
            urlField.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            if (!addOpener.current?.isConnected) return;
            e.preventDefault();
            addOpener.current.focus();
          }}
        >
          <Dialog.Header>
            <Dialog.Title>{findMode ? 'Find' : 'Add a job'}</Dialog.Title>
          </Dialog.Header>
          {findMode ? (
            <Suspense fallback={null}>
              <FindBox
                initial={url}
                autoFocus
                onDone={() => onAddOpenChange(false)}
                footer={
                  <Dialog.Close asChild>
                    <UiButton variant="secondary">Cancel</UiButton>
                  </Dialog.Close>
                }
              />
            </Suspense>
          ) : (
            <Form noValidate onSubmit={submit}>
              <Stack gap="normal">
                <HdsInput
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
                  helperText="The title fills in from the link. You can edit it after."
                  error={!!urlError}
                  errorMessage={urlError ?? undefined}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (urlError) setUrlError(null);
                  }}
                />
                {/* One Find box (#384) until Today hosts it: the same dialog takes anything. */}
                <div>
                  <UiButton variant="tertiary" size="sm" onClick={() => setFindMode(true)}>
                    Paste a company, board or title instead
                  </UiButton>
                </div>
                {/* Phone: the full-width primary over a full-width Cancel (rev-3 mock). From sm, one
                    row with Add job right-most. Add job comes first in the DOM either way. */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: { base: 'column', sm: 'row-reverse' },
                    gap: 'xs',
                  }}
                >
                  <UiButton type="submit" variant="primary">
                    Add job
                  </UiButton>
                  <Dialog.Close asChild>
                    <UiButton variant="secondary">Cancel</UiButton>
                  </Dialog.Close>
                </Box>
              </Stack>
            </Form>
          )}
        </Dialog.Content>
      </Dialog>
    </>
  );
}
