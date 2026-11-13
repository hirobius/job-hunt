// The magic-link sign-in screen: the conventional passwordless pattern (Adrian, 2026-10-17), a
// full-screen HDS Dialog since the brand pass (2026-10-29): the flame and the wordmark, what the
// app does, one field, one primary button (Send link), validation on submit, a "Check your email"
// state with Resend (30 s cooldown) and Use a different email, and Continue without an account
// on both. The auth call is mocked at the seam.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { CloudSyncContext, type CloudSyncApi } from './accountContext';
import SignInDialog, { RESEND_COOLDOWN_S } from './SignInDialog';
import { SIGN_IN_ERRORS } from './signInErrors';
import { BRAND } from '../brand';
import { googleSignInEnabled, setGoogleSignIn } from './googleSignInFlag';
import { linkedInSignInEnabled, setLinkedInSignIn } from './linkedInSignInFlag';
import { SIGN_IN_BENEFIT, SIGN_IN_HOW } from './signInCopy';

function Harness({
  sendLink,
  signInWithGoogle = async () => null,
  signInWithLinkedIn = async () => null,
}: {
  sendLink: CloudSyncApi['sendLink'];
  signInWithGoogle?: CloudSyncApi['signInWithGoogle'];
  signInWithLinkedIn?: CloudSyncApi['signInWithLinkedIn'];
}) {
  const [open, setOpen] = useState(true);
  const api = {
    user: null,
    authResolved: true,
    status: '',
    settled: true,
    offline: false,
    sendLink,
    signInWithGoogle,
    signInWithLinkedIn,
    retry: () => {},
    signOut: () => {},
    deleteMyData: () => {},
    signInOpen: open,
    setSignInOpen: setOpen,
  } satisfies CloudSyncApi;
  return (
    <CloudSyncContext.Provider value={api}>
      <SignInDialog />
    </CloudSyncContext.Provider>
  );
}

const setup = (
  sendLink = vi.fn(async () => null as string | null),
  signInWithGoogle = vi.fn(async () => null as string | null),
  signInWithLinkedIn = vi.fn(async () => null as string | null),
) => {
  render(
    <Harness
      sendLink={sendLink}
      signInWithGoogle={signInWithGoogle}
      signInWithLinkedIn={signInWithLinkedIn}
    />,
  );
  return { sendLink, signInWithGoogle, signInWithLinkedIn, dialog: screen.getByRole('dialog') };
};
const field = () => screen.getByRole('textbox', { name: 'Email' });
const submit = () => screen.getByRole('button', { name: 'Send link' });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The animated logo (src/brand/RoleFlame.tsx), stacked: the flame above the name.
const brandOf = (dialog: HTMLElement) => {
  const logo = dialog.querySelector('.rjb-rf[data-layout="stacked"]');
  const flame = logo?.querySelector(':scope > svg') ?? null;
  const word = logo;
  return { flame, word };
};

const COPY = SIGN_IN_BENEFIT;
/** The legal line at the foot (2026-11-13). */
const AGREE = `By signing in, you agree to ${BRAND.name}’s Terms of use and Privacy policy.`;
/** How it works is the Email field's helper (Adrian 2026-11-12). */
const EMAIL = `Email${SIGN_IN_HOW}`;

describe('SignInDialog', () => {
  it('ends with one legal line whose two links open Privacy and terms on their tab (2026-11-13)', () => {
    window.location.hash = '#/review';
    const { dialog } = setup();
    const line = within(dialog).getByText(/^By signing in, you agree to/);
    expect(line).toHaveTextContent(
      `By signing in, you agree to ${BRAND.name}’s Terms of use and Privacy policy.`,
    );
    expect(within(line).getByRole('link', { name: 'Terms of use' })).toHaveAttribute(
      'href',
      '#/review?legal=terms',
    );
    expect(within(line).getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      '#/review?legal=privacy',
    );
    // The only legal links on the screen, and the last thing in it.
    expect(
      within(dialog)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual(['Terms of use', 'Privacy policy']);
    const step = line.parentElement!;
    expect(step.lastElementChild).toBe(line);
    window.location.hash = '';
  });

  it('is a full screen with the flame and the wordmark (not a heading) above the title', () => {
    const { dialog } = setup();
    expect(dialog).toHaveClass('rjb-signin-screen');
    const { flame, word } = brandOf(dialog);
    expect(flame).not.toBeNull();
    expect(flame?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(flame?.querySelector('path')).not.toBeNull();
    expect(word).toHaveTextContent(BRAND.name);
    expect(word?.tagName).not.toMatch(/^H\d$/);
    expect(
      within(dialog)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Sign in']);
  });

  it('ships with Continue with Google (the provider is on since 2026-11-12)', () => {
    expect(googleSignInEnabled()).toBe(true);
  });

  it('ships with Continue with LinkedIn (linkedin_oidc is on since 2026-11-12)', () => {
    expect(linkedInSignInEnabled()).toBe(true);
  });

  it('with both flags off: Email, Send link and Continue without an account, no providers', () => {
    setGoogleSignIn(false);
    setLinkedInSignIn(false);
    const { dialog } = setup();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue with LinkedIn' })).toBeNull();
    expect(dialog.querySelector('.rjb-signin-google')).toBeNull();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Send link', 'Continue without an account', '']);
    expect(dialog.textContent).toBe(
      `${BRAND.name}Sign in${COPY}${EMAIL}Send linkContinue without an account${AGREE}`,
    );
    // The magic link still signs in.
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
  });

  it('with the flag on: the flame, the wordmark, Continue with Google, Email, Send link and Continue without an account', () => {
    setGoogleSignIn(true);
    const { dialog } = setup();
    // The benefit describes the screen (#555); how it works describes the Email field (Adrian
    // 2026-11-12): the title is for screen readers only.
    expect(dialog).toHaveAccessibleDescription(SIGN_IN_BENEFIT);
    expect(within(dialog).getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription(
      SIGN_IN_HOW,
    );
    expect(
      within(dialog).getByRole('heading', { name: 'Sign in' }).closest('.sr-only'),
    ).not.toBeNull();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Continue with Google',
      'Continue with LinkedIn',
      'Send link',
      'Continue without an account',
      '',
    ]);
    expect(dialog.textContent).toBe(
      `${BRAND.name}Sign in${COPY}Continue with GoogleContinue with LinkedIn${EMAIL}Send linkContinue without an account${AGREE}`,
    );
  });

  it('has its own Pause / Play animations toggle, last in the tab order (WCAG 2.2.2, #519 review)', async () => {
    localStorage.removeItem('rjb_ui_pause_motion');
    const { dialog } = setup();
    const buttons = within(dialog).getAllByRole('button');
    const pause = within(dialog).getByRole('button', { name: 'Pause animations' });
    expect(buttons[buttons.length - 1]).toBe(pause);
    const column = dialog.querySelector('.rjb-signin-screen__column')!;
    expect(column).not.toHaveAttribute('data-paused');
    await userEvent.click(pause);
    // The same per-device choice as the Account menu's item.
    expect(localStorage.getItem('rjb_ui_pause_motion')).toBe('1');
    expect(column).toHaveAttribute('data-paused', 'true');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Play animations' }));
    expect(localStorage.getItem('rjb_ui_pause_motion')).toBe('0');
    expect(within(dialog).getByRole('button', { name: 'Pause animations' })).toBeInTheDocument();
    localStorage.removeItem('rjb_ui_pause_motion');
  });

  it('Continue without an account closes the screen', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Continue without an account' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the Check your email state keeps the brand and Continue without an account', async () => {
    setup();
    await userEvent.type(field(), 'me@example.com{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Check your email' });
    const { flame, word } = brandOf(dialog);
    expect(flame?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(word).toHaveTextContent(BRAND.name);
    expect(within(dialog).getByRole('button', { name: 'Resend in 30s' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Use a different email' })).toBeEnabled();
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Continue without an account' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is titled Sign in, with one field and one primary button', () => {
    const { dialog } = setup();
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBe(dialog);
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(dialog.textContent).not.toMatch(/supabase/i);
    const input = field();
    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('autocomplete', 'email');
    expect(input).toHaveAttribute('inputmode', 'email');
    expect(input).toHaveAttribute('autocapitalize', 'none');
    expect(submit()).toBeEnabled();
  });

  it('focuses the email field on open', () => {
    setup();
    expect(field()).toHaveFocus();
  });

  it('validates on submit, inline, and does not call the server', async () => {
    const { sendLink } = setup();
    await userEvent.click(submit());
    expect(screen.getByText(SIGN_IN_ERRORS.empty)).toBeInTheDocument();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(field(), 'adrian');
    await userEvent.click(submit());
    expect(screen.getByText(SIGN_IN_ERRORS.invalid)).toBeInTheDocument();
    expect(sendLink).not.toHaveBeenCalled();
  });

  it('Enter submits; the sent state names the address', async () => {
    const { sendLink } = setup();
    await userEvent.type(field(), ' me@example.com {Enter}');
    expect(sendLink).toHaveBeenCalledWith('me@example.com');
    const dialog = await screen.findByRole('dialog', { name: 'Check your email' });
    expect(within(dialog).getByText(/We sent a sign-in link to/)).toHaveTextContent(
      'We sent a sign-in link to me@example.com.',
    );
  });

  it('shows the server error inline, in plain words, and stays on the form', async () => {
    setup(vi.fn(async () => SIGN_IN_ERRORS.rateLimit));
    await userEvent.type(field(), 'me@example.com{Enter}');
    expect(await screen.findByText(SIGN_IN_ERRORS.rateLimit)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('Use a different email goes back to the form with the address kept', async () => {
    setup();
    await userEvent.type(field(), 'me@example.com{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: 'Use a different email' }));
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
    expect(field()).toHaveValue('me@example.com');
  });

  it('Resend waits out a 30 s cooldown, then sends again and restarts it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const { sendLink } = setup();
    fireEvent.change(field(), { target: { value: 'me@example.com' } });
    await act(async () => {
      fireEvent.click(submit());
    });
    expect(RESEND_COOLDOWN_S).toBe(30);
    const resend = () => screen.getByRole('button', { name: /^Resend/ });
    expect(resend()).toBeDisabled();
    expect(resend()).toHaveTextContent('Resend in 30s');
    act(() => vi.advanceTimersByTime(29_000));
    expect(resend()).toBeDisabled();
    act(() => vi.advanceTimersByTime(1_000));
    expect(resend()).toBeEnabled();
    expect(resend()).toHaveTextContent(/^Resend$/);
    await act(async () => {
      fireEvent.click(resend());
    });
    expect(sendLink).toHaveBeenCalledTimes(2);
    expect(resend()).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Sent again.');
  });

  describe('Continue with Google (#482)', () => {
    beforeEach(() => setGoogleSignIn(true));
    const googleButton = () => screen.getByRole('button', { name: 'Continue with Google' });

    it("sits above the email field, an HDS secondary Button with Google's mark (decorative)", () => {
      const { dialog } = setup();
      const button = googleButton();
      expect(
        button.compareDocumentPosition(field()) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const mark = button.querySelector('.rjb-google-mark');
      expect(mark).not.toBeNull();
      expect(mark).toHaveAttribute('aria-hidden', 'true');
      // Google's four colours, unchanged (branding rules).
      const html = mark!.innerHTML.toUpperCase();
      for (const c of ['#EA4335', '#4285F4', '#FBBC05', '#34A853']) expect(html).toContain(c);
      // The magic link is still there.
      expect(within(dialog).getByRole('button', { name: 'Send link' })).toBeInTheDocument();
    });

    it('starts the Google sign-in, once, and stays busy while the page leaves', async () => {
      let finish: (v: string | null) => void = () => {};
      const signInWithGoogle = vi.fn(() => new Promise<string | null>((r) => (finish = r)));
      setup(undefined, signInWithGoogle);
      await userEvent.click(googleButton());
      await userEvent.click(googleButton());
      expect(signInWithGoogle).toHaveBeenCalledTimes(1);
      await act(async () => finish(null));
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows an error inline when Google sign-in cannot start, and can try again', async () => {
      const signInWithGoogle = vi.fn(async () => SIGN_IN_ERRORS.offline as string | null);
      setup(undefined, signInWithGoogle);
      await userEvent.click(googleButton());
      expect(await screen.findByText(SIGN_IN_ERRORS.offline)).toBeInTheDocument();
      signInWithGoogle.mockResolvedValueOnce(null);
      await userEvent.click(googleButton());
      expect(signInWithGoogle).toHaveBeenCalledTimes(2);
    });
  });

  describe('Continue with LinkedIn', () => {
    const linkedInButton = () => screen.getByRole('button', { name: 'Continue with LinkedIn' });

    it("sits under Google and above the email field, with LinkedIn's blue in bug (decorative)", () => {
      setup();
      const button = linkedInButton();
      expect(
        googleButton2().compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        button.compareDocumentPosition(field()) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      const mark = button.querySelector('.rjb-linkedin-mark');
      expect(mark).toHaveAttribute('aria-hidden', 'true');
      expect(mark!.innerHTML.toUpperCase()).toContain('#0A66C2');
    });

    it('with only LinkedIn on, Google is gone and LinkedIn stays', () => {
      setGoogleSignIn(false);
      setup();
      expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
      expect(linkedInButton()).toBeInTheDocument();
    });

    it('starts the LinkedIn sign-in once; a second press of either provider does nothing', async () => {
      let finish: (v: string | null) => void = () => {};
      const signInWithLinkedIn = vi.fn(() => new Promise<string | null>((r) => (finish = r)));
      const { signInWithGoogle } = setup(undefined, undefined, signInWithLinkedIn);
      await userEvent.click(linkedInButton());
      await userEvent.click(linkedInButton());
      await userEvent.click(googleButton2());
      expect(signInWithLinkedIn).toHaveBeenCalledTimes(1);
      expect(signInWithGoogle).not.toHaveBeenCalled();
      await act(async () => finish(null));
    });

    it("an error shows inline outside the buttons' wrapper, so it stays when the keyboard hides them", async () => {
      const signInWithLinkedIn = vi.fn(async () => SIGN_IN_ERRORS.offline as string | null);
      setup(undefined, undefined, signInWithLinkedIn);
      await userEvent.click(linkedInButton());
      const err = await screen.findByText(SIGN_IN_ERRORS.offline);
      expect(err.closest('.rjb-signin-google')).toBeNull();
    });
  });
});

const googleButton2 = () => screen.getByRole('button', { name: 'Continue with Google' });
