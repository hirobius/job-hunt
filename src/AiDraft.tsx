// Draft with AI (#232, ADR 0009): a closed row above a document's text. Open, it asks what the
// draft should say; the button reads Draft when the text is empty and Rewrite when there is text
// to work from. The answer is handed to the editor, which saves it as a new Version (never over
// an earlier one, never over a Sent one). Hidden unless the server says drafting is set up.
// Failures are named (not signed in, budget used up, provider failure, bad input) in an Alert.
import { useContext, useEffect, useState } from 'react';
import { Alert, Box, Button, Disclosure, Stack, Text, Textarea } from '@hirobius/design-system';
import { CloudSyncContext } from './account/accountContext';
import { draftConfigured, requestDraft } from './aiDraft/client';
import { MAX_INSTRUCTION, MAX_TEXT, type DocumentKind } from './aiDraft/contract';

export function AiDraft({
  kind,
  title,
  text,
  onDrafted,
}: {
  kind: DocumentKind;
  title: string;
  /** The editor's current text: what a Rewrite works from. */
  text: string;
  /** Save the draft as a new Version. */
  onDrafted: (text: string) => void;
}) {
  const sync = useContext(CloudSyncContext);
  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    let live = true;
    void draftConfigured().then((ok) => live && setConfigured(ok));
    return () => {
      live = false;
    };
  }, []);
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  if (!configured) return null;

  const rewrite = text.trim() !== '';
  const signedOut = sync ? !sync.user : false;
  const tooLong = text.length > MAX_TEXT;
  const canGo = !busy && !tooLong && (rewrite || instruction.trim() !== '');
  const go = async () => {
    setBusy(true);
    setError(null);
    const r = await requestDraft({
      kind,
      mode: rewrite ? 'rewrite' : 'draft',
      text,
      instruction,
      ...(title.trim() ? { title: title.trim().slice(0, 200) } : {}),
    });
    setBusy(false);
    if (r.ok) {
      setInstruction('');
      onDrafted(r.text);
    } else setError({ code: r.code, message: r.message });
  };

  return (
    <Disclosure label="Draft with AI">
      <Stack gap="tight" className="rjb-form-full">
        <Text variant="caption" as="p" tone="secondary">
          {rewrite
            ? 'Rewrites the text below. The result is saved as a new version; earlier ones stay.'
            : 'Writes a first draft. It is saved as a version you can edit.'}
        </Text>
        <Textarea
          label={rewrite ? 'How should it change? (optional)' : 'What should it say?'}
          rows={3}
          value={instruction}
          maxLength={MAX_INSTRUCTION}
          onChange={(e) => setInstruction(e.target.value)}
        />
        {tooLong && (
          <Alert tone="warning">{`The text is over ${MAX_TEXT.toLocaleString()} characters, too long to rewrite.`}</Alert>
        )}
        {error && (
          <Alert tone="danger" title={error.code === 'cap_reached' ? 'Budget used up' : undefined}>
            {error.message}
          </Alert>
        )}
        <Stack direction="row" gap="tight" wrap="wrap" align="center">
          <Box>
            <Button variant="secondary" loading={busy} disabled={!canGo} onClick={go}>
              {rewrite ? 'Rewrite' : 'Draft'}
            </Button>
          </Box>
          {signedOut && sync && error?.code === 'not_signed_in' && (
            <Button variant="tertiary" onClick={() => sync.setSignInOpen(true)}>
              Sign in
            </Button>
          )}
        </Stack>
      </Stack>
    </Disclosure>
  );
}
