// "Sign in as x@y.com?" (the login-injection guard, security audit 2026-10-22) as a full-screen pii-allow
// step in the sign-in layout (sign-in layout PR, 2026-11-08): the same brand at the same place,
// the security copy, Sign in (primary) and Cancel (quiet). Closing it any way (Cancel, Escape,
// Back) is the safe answer: the link is dropped. After Sign in a short "Signed in" state shows,
// then the flame and wordmark move up to the app bar's logo (under 400 ms; a crossfade under
// reduced motion). The link is taken up on the press (acceptLink, then the merge ask if this
// device has data); the screen only stays for the hand-over.
// Its own chunk (lazyDialogs.ts): most visits never see it.
import { useRef, useState } from 'react';
import { Button, Dialog, Stack, Text } from '@hirobius/design-system';
import { useBackCloses } from '../useBackCloses';
import { SignInShell } from './SignInShell';

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
  /** Sign in was pressed: take the link up now (the screen stays for its "Signed in" state). */
  onSignIn: () => void;
  /** The brand has reached the app bar: close the screen. */
  onDone: () => void;
  onCancel: () => void;
}) {
  const [done, setDone] = useState(false);
  const brandRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  // Back is Cancel, while it still asks.
  useBackCloses(!done, onCancel, 'auth-link-confirm');

  const signIn = () => {
    if (done) return;
    setDone(true);
    onSignIn();
    setTimeout(() => {
      void moveBrand(brandRef.current, screenRef.current).then(onDone);
    }, SIGNED_IN_HOLD_MS);
  };

  return (
    <Dialog open={!!email} onOpenChange={(o) => !o && !done && onCancel()}>
      <SignInShell
        brandRef={brandRef}
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
            <Stack gap="tight">
              <Button variant="primary" className="sign-in-dialog__primary" onClick={signIn}>
                Sign in
              </Button>
              <Button variant="tertiary" className="sign-in-dialog__primary" onClick={onCancel}>
                Cancel
              </Button>
            </Stack>
          </>
        )}
      </SignInShell>
    </Dialog>
  );
}
