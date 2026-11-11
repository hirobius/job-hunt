// "Sign in as x@y.com?" (the login-injection guard, security audit 2026-10-22) as a full-screen pii-allow
// step in the sign-in layout (sign-in layout PR, 2026-11-08): the same brand at the same place,
// the security copy, Sign in (primary) and Cancel (quiet). Closing it any way (Cancel, Escape,
// Back) is the safe answer: the link is dropped. Sign in says "Signing in…" until the session is
// real; then a short "Signed in" state shows and the flame and wordmark move up to the app bar's
// logo (under 400 ms; a crossfade under reduced motion). A failure stays here, said in place,
// with Cancel or another try. After that the guard goes on (the merge ask if this device has data).
// Its own chunk (lazyDialogs.ts): most visits never see it.
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dialog, Stack, Text } from '@hirobius/design-system';
import { useBackCloses } from '../useBackCloses';
import { SignInShell } from './SignInShell';
import { focusAsHeading, pageHeading, pageHeadingNow } from '../focusRescue';
import { ExitButton } from '../hds-gaps/ExitButton';

/** How long "Signed in" shows before the brand moves to the app bar. */
export const SIGNED_IN_HOLD_MS = 600;
/** The brand's move to the app bar (or the crossfade under reduced motion). */
export const BRAND_MOVE_MS = 350;

const reduced = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Move the brand onto the app bar's logo (FLIP), or fade it out under reduced motion. */
function moveBrand(brand: HTMLElement | null, screen: HTMLElement | null): Promise<void> {
  const target = document.querySelector('header [role="img"]');
  if (!brand || typeof brand.animate !== 'function') return Promise.resolve();
  if (reduced() || !target) {
    const fade = { opacity: [1, 0] };
    return Promise.all(
      [brand, screen].map((el) =>
        el?.animate(fade, { duration: BRAND_MOVE_MS, fill: 'forwards' }).finished.catch(() => {}),
      ),
    ).then(() => {});
  }
  const from = brand.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const scale = Math.min(to.height / from.height, to.width / from.width);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  screen?.animate(
    { backgroundColor: [getComputedStyle(screen).backgroundColor, 'transparent'] },
    { duration: BRAND_MOVE_MS, fill: 'forwards' },
  );
  // The step's words go as the brand leaves.
  screen
    ?.querySelector('.rjb-signin-screen__step')
    ?.animate({ opacity: [1, 0] }, { duration: BRAND_MOVE_MS / 2, fill: 'forwards' });
  return brand
    .animate(
      { transform: ['none', `translate(${dx}px, ${dy}px) scale(${scale})`] },
      { duration: BRAND_MOVE_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'forwards' },
    )
    .finished.then(
      () => {},
      () => {},
    );
}

export default function LinkConfirmScreen({
  email,
  onSignIn,
  onDone,
  onCancel,
}: {
  email: string;
  /** Sign in was pressed: take the link up. Resolves true once the session is real. */
  onSignIn: () => Promise<boolean>;
  /** The brand has reached the app bar: close the screen. */
  onDone: () => void;
  onCancel: () => void;
}) {
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  // The "Signed in" hold is cleared if the screen goes first (#516 review); nothing runs after.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    // Set on mount too: StrictMode runs the cleanup once and mounts again.
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(holdTimer.current);
    };
  }, []);
  // Back is Cancel, while it still asks.
  useBackCloses(!done, onCancel, 'auth-link-confirm');

  // "Signed in" only once the session is real (#515 review): "Signing in…" on the button until
  // then; a failure stays here with the reason in place, and Cancel or another try.
  const signIn = async () => {
    if (done || pending) return;
    setPending(true);
    setError(null);
    const ok = await onSignIn();
    setPending(false);
    if (!ok) {
      setError('That sign-in link could not be used. Send a new one from Account.');
      return;
    }
    setDone(true);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = undefined;
      void moveBrand(brandRef.current, screenRef.current).then(() => {
        if (!mounted.current) return;
        onDone();
        // The host unmounts the screen with onDone, so no close-focus runs: once it has gone,
        // focus goes to the page's own h1 (#516 review).
        setTimeout(() => {
          const h = pageHeadingNow();
          if (h) focusAsHeading(h);
        });
      });
    }, SIGNED_IN_HOLD_MS);
  };

  return (
    <Dialog open={!!email} onOpenChange={(o) => !o && !done && !pending && onCancel()}>
      <SignInShell
        brandRef={brandRef}
        // After the hand-over, focus lands on the page's own h1 (#516 review), never on <body>.
        // Cancelled, Radix gives it back to whatever had it.
        onCloseAutoFocus={(e) => {
          if (!done) return;
          const h = pageHeading();
          if (!h) return;
          e.preventDefault();
          focusAsHeading(h);
        }}
        onOpenAutoFocus={(e) => {
          // Start on the title's words, not on Sign in: an answer here must be a choice.
          e.preventDefault();
          screenRef.current = e.target as HTMLDivElement;
          (e.target as HTMLElement).querySelector<HTMLElement>('[data-confirm-title]')?.focus();
        }}
      >
        {done ? (
          <Dialog.Header>
            <Dialog.Title>Signed in</Dialog.Title>
            <Dialog.Description>
              <Text variant="body" as="span" tone="secondary" role="status">
                {`as ${email}`}
              </Text>
            </Dialog.Description>
          </Dialog.Header>
        ) : (
          <>
            <Dialog.Header>
              {/* data-focus-heading: a landing spot, no ring (base.css), like a page's h1. */}
              <Dialog.Title data-confirm-title data-focus-heading tabIndex={-1}>
                Sign in as {email}?
              </Dialog.Title>
              <Dialog.Description>
                This link signs this browser in to that account. Only continue if you asked for it.
              </Dialog.Description>
            </Dialog.Header>
            {error && <Alert tone="danger">{error}</Alert>}
            <Stack gap="tight">
              <Button
                variant="primary"
                className="sign-in-dialog__primary"
                loading={pending}
                onClick={() => void signIn()}
              >
                {pending ? 'Signing in…' : 'Sign in'}
              </Button>
              <ExitButton
                className="sign-in-dialog__primary"
                disabled={pending}
                onClick={onCancel}
              >
                Cancel
              </ExitButton>
            </Stack>
          </>
        )}
      </SignInShell>
    </Dialog>
  );
}
