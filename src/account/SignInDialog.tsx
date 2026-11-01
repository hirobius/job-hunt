// Magic-link sign-in (#115 Phase 1; conventional passwordless pattern, 2026-10-17), opened from
// the account menu or the sync nudge. A full-screen HDS Dialog (brand pass, 2026-10-29): the
// flame and the wordmark, one field and Send link, no other words; validation on submit; then
// a "Check your email" state with Resend (30 s cooldown) and Use a different email. Both end in
// Continue without an account, which only closes it. The screen is sized to the visual viewport
// (useVisualViewportVars), so on a phone the iOS keyboard never covers the field or the button;
// on a short one the brand shrinks (SignInDialog.css). Only the presentation lives here: sending
// and every auth rule stay in the CloudSync seam.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Dialog, Input, Stack, Text, VisuallyHidden } from '@hirobius/design-system';
import { Form } from '@hirobius/design-system/patterns';
import { refocusAccount, useCloudSync } from './accountContext';
import { emailProblem } from './signInErrors';
import { useVisualViewportVars } from '../hds-gaps/useVisualViewportVars';
import { useBackCloses } from '../useBackCloses';
import { Wordmark } from '../brand/Wordmark';
import './SignInDialog.css';

export const RESEND_COOLDOWN_S = 30;

/** The wordmark (the flame, then the name). Not a heading: the screen's title is Sign in. */
function SignInBrand() {
  return (
    <div className="rjb-signin-screen__brand">
      <Wordmark as="p" />
    </div>
  );
}

export default function SignInDialog() {
  const { signInOpen, setSignInOpen, sendLink, accountTrigger } = useCloudSync();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useVisualViewportVars<HTMLDivElement>();

  // Seconds left before Resend; one tick a second while the cooldown runs.
  const cooldown = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [resendAt]);

  const request = async (to: string): Promise<boolean> => {
    setSending(true);
    setSendError(null);
    const err = await sendLink(to);
    setSending(false);
    if (err) {
      setSendError(err);
      return false;
    }
    const t = Date.now();
    setNow(t);
    setResendAt(t + RESEND_COOLDOWN_S * 1000);
    return true;
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (sending) return;
    const problem = emailProblem(email);
    setFieldError(problem);
    if (problem) {
      inputRef.current?.focus();
      return;
    }
    const to = email.trim();
    if (await request(to)) {
      setResent(false);
      setSentTo(to);
    }
  };

  const resend = async () => {
    if (!sentTo || sending || cooldown > 0) return;
    if (await request(sentTo)) setResent(true);
  };

  const differentEmail = () => {
    setSentTo(null);
    setSendError(null);
    setResent(false);
  };

  const onOpenChange = (open: boolean) => {
    setSignInOpen(open);
    if (!open) {
      differentEmail();
      setFieldError(null);
    }
  };
  // The browser's Back closes it and stays on the page (return paths).
  useBackCloses(signInOpen, () => onOpenChange(false), 'sign-in');

  return (
    <Dialog open={signInOpen} onOpenChange={onOpenChange}>
      <Dialog.Content
        ref={viewportRef}
        className="rjb-signin-screen"
        hideClose
        onCloseAutoFocus={refocusAccount(accountTrigger)}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="rjb-signin-screen__column">
          <SignInBrand />
          {sentTo ? (
            <>
              <Dialog.Header>
                <Dialog.Title>Check your email</Dialog.Title>
                <Dialog.Description>We sent a sign-in link to {sentTo}.</Dialog.Description>
              </Dialog.Header>
              {sendError && <Alert tone="danger">{sendError}</Alert>}
              <Text variant="caption" as="p" role="status" tone="secondary">
                {resent ? 'Sent again.' : ''}
              </Text>
              <Stack gap="tight">
                <Button
                  className="sign-in-dialog__primary"
                  disabled={cooldown > 0}
                  loading={sending}
                  onClick={() => void resend()}
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
                </Button>
                <Button
                  className="sign-in-dialog__primary"
                  variant="tertiary"
                  onClick={differentEmail}
                >
                  Use a different email
                </Button>
              </Stack>
            </>
          ) : (
            <>
              {/* No words beyond the controls (Adrian 2026-10-29): the title names the screen
                  for screen readers only. */}
              <VisuallyHidden as="div">
                <Dialog.Title>Sign in</Dialog.Title>
              </VisuallyHidden>
              <Form noValidate onSubmit={(e) => void submit(e)}>
                <Stack gap="normal">
                  <Input
                    ref={inputRef}
                    type="email"
                    label="Email"
                    placeholder="Email"
                    autoComplete="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="go"
                    value={email}
                    error={!!fieldError}
                    errorMessage={fieldError ?? undefined}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldError) setFieldError(null);
                    }}
                  />
                  {sendError && <Alert tone="danger">{sendError}</Alert>}
                  <Button
                    type="submit"
                    variant="primary"
                    className="sign-in-dialog__primary"
                    loading={sending}
                  >
                    Send link
                  </Button>
                </Stack>
              </Form>
            </>
          )}
          <Button
            className="sign-in-dialog__primary"
            variant="tertiary"
            onClick={() => onOpenChange(false)}
          >
            Continue without an account
          </Button>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
