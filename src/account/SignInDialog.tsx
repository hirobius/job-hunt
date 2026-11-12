// Magic-link sign-in (#115 Phase 1; conventional passwordless pattern, 2026-10-17), opened from
// the account menu or the sync nudge. A full-screen HDS Dialog (brand pass, 2026-10-29): the
// flame and the wordmark, one field and Send link, no other words; validation on submit; then
// a "Check your email" state with Resend (30 s cooldown) and Use a different email. Both end in
// Continue without an account, which only closes it. The screen is sized to the visual viewport
// (useVisualViewportVars), so on a phone the iOS keyboard never covers the field or the button;
// on a short one the brand shrinks (SignInDialog.css). "Continue with Google" (#482), when its
// flag is on (googleSignInFlag.ts, on since 2026-11-12), sits above the field: Google's mark and label on an HDS secondary Button; the page then leaves for Google.
// Only the presentation lives here: sending and every auth rule stay in the CloudSync seam.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  Input,
  Stack,
  Text,
  VisuallyHidden,
} from '@hirobius/design-system';
import { SIGN_IN_BENEFIT, SIGN_IN_COPY_ID, SIGN_IN_HOW } from './signInCopy';
import { Form } from '@hirobius/design-system/patterns';
import { refocusAccount, useCloudSync } from './accountContext';
import { emailProblem } from './signInErrors';
import { useBackCloses } from '../useBackCloses';
import { GoogleMark } from './GoogleMark';
import { googleSignInEnabled } from './googleSignInFlag';
import { LinkedInMark } from './LinkedInMark';
import { linkedInSignInEnabled } from './linkedInSignInFlag';
import { SignInShell } from './SignInShell';
import { holdPage } from './holdPage';
import { ExitButton } from '../hds-gaps/ExitButton';

export const RESEND_COOLDOWN_S = 30;

export default function SignInDialog() {
  const {
    signInOpen,
    setSignInOpen,
    sendLink,
    signInWithGoogle,
    signInWithLinkedIn,
    accountTrigger,
  } = useCloudSync();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [sending, setSending] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<'google' | 'linkedin' | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

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

  // The page leaves for Google; the button stays busy until it does. An error comes back here.
  // LinkedIn the same way; one provider leaves at a time, and its error shows under the buttons.
  const leave = async (start: () => Promise<string | null>, which: 'google' | 'linkedin') => {
    if (leaving) return;
    setLeaving(which);
    setGoogleError(null);
    const err = await start();
    if (err) {
      setGoogleError(err);
      setLeaving(null);
    }
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
      setGoogleError(null);
      setLeaving(null);
    }
  };
  // The browser's Back closes it and stays on the page (return paths).
  // While open, the page under the screen stays mounted (an unsaved draft or a typed URL
  // survives) but is inert and hidden from assistive tech; its heavy work (the feed read and
  // build, liveness checks, the scan) holds on `signInOpen` and resumes on close (2026-11-09).
  useEffect(() => holdPage(signInOpen), [signInOpen]);
  useBackCloses(signInOpen, () => onOpenChange(false), 'sign-in');

  return (
    <Dialog open={signInOpen} onOpenChange={onOpenChange}>
      <SignInShell
        // The form step is described by its two lines; "Check your email" by its Description.
        {...(sentTo ? {} : { 'aria-describedby': SIGN_IN_COPY_ID })}
        onCloseAutoFocus={refocusAccount(accountTrigger)}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
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
            {/* The title names the screen for screen readers only; under the wordmark, the benefit
                (redesign §5.8, #555), which also describes the screen; how it works is the Email
                field's helper (Adrian 2026-11-12). Provider keys have no raised edge
                (shadow none) so Send link leads. */}
            <VisuallyHidden as="div">
              <Dialog.Title>Sign in</Dialog.Title>
            </VisuallyHidden>
            <Box id={SIGN_IN_COPY_ID}>
              <Text as="p" variant="body" tone="primary">
                {SIGN_IN_BENEFIT}
              </Text>
            </Box>
            {/* Behind googleSignInFlag.ts / linkedInSignInFlag.ts (both on since 2026-11-12).
                The buttons give way to the keyboard (SignInDialog.css); their error stays. */}
            {(googleSignInEnabled() || linkedInSignInEnabled()) && (
              <Box className="rjb-signin-google">
                <Stack gap="tight">
                  {googleSignInEnabled() && (
                    <Button
                      variant="secondary"
                      shadow="none"
                      className="sign-in-dialog__primary"
                      iconLeft={<GoogleMark />}
                      loading={leaving === 'google'}
                      onClick={() => void leave(signInWithGoogle, 'google')}
                    >
                      Continue with Google
                    </Button>
                  )}
                  {linkedInSignInEnabled() && (
                    <Button
                      variant="secondary"
                      shadow="none"
                      className="sign-in-dialog__primary"
                      iconLeft={<LinkedInMark />}
                      loading={leaving === 'linkedin'}
                      onClick={() => void leave(signInWithLinkedIn, 'linkedin')}
                    >
                      Continue with LinkedIn
                    </Button>
                  )}
                </Stack>
              </Box>
            )}
            {googleError && <Alert tone="danger">{googleError}</Alert>}
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
                  helperText={SIGN_IN_HOW}
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
        <ExitButton className="sign-in-dialog__primary" onClick={() => onOpenChange(false)}>
          Continue without an account
        </ExitButton>
      </SignInShell>
    </Dialog>
  );
}
