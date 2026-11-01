// The magic-link sign-in screen: the conventional passwordless pattern (Adrian, 2026-10-17), a
// full-screen HDS Dialog since the brand pass (2026-10-29): the flame and the wordmark, what the
// app does, one field, one primary button (Send link), validation on submit, a "Check your email"
// state with Resend (30 s cooldown) and Use a different email, and Continue without an account
// on both. The auth call is mocked at the seam.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { CloudSyncContext, type CloudSyncApi } from './accountContext';
import SignInDialog, { RESEND_COOLDOWN_S } from './SignInDialog';
import { SIGN_IN_ERRORS } from './signInErrors';
import { BRAND } from '../brand';

function Harness({ sendLink }: { sendLink: CloudSyncApi['sendLink'] }) {
  const [open, setOpen] = useState(true);
  const api = {
    user: null,
    authResolved: true,
    status: '',
    settled: true,
    offline: false,
    sendLink,
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

const setup = (sendLink = vi.fn(async () => null as string | null)) => {
  render(<Harness sendLink={sendLink} />);
  return { sendLink, dialog: screen.getByRole('dialog') };
};
const field = () => screen.getByRole('textbox', { name: 'Email' });
const submit = () => screen.getByRole('button', { name: 'Send link' });

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const brandOf = (dialog: HTMLElement) => {
  const flame = dialog.querySelector('.rjb-flame');
  const word = dialog.querySelector('.rjb-logo-word');
  return { flame, word };
};

describe('SignInDialog', () => {
  it('is a full screen with the flame and the wordmark (not a heading) above the title', () => {
    const { dialog } = setup();
    expect(dialog).toHaveClass('rjb-signin-screen');
    const { flame, word } = brandOf(dialog);
    expect(flame).not.toBeNull();
    expect(flame?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(flame?.closest('.rjb-wordmark-flame')).not.toBeNull();
    expect(flame?.querySelector('svg')).not.toBeNull();
    expect(word).toHaveTextContent(BRAND.name);
    expect(word?.tagName).not.toMatch(/^H\d$/);
    expect(
      within(dialog)
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['Sign in']);
  });

  it('shows only the flame, the wordmark, Email, Send link and Continue without an account', () => {
    const { dialog } = setup();
    // No paragraphs (Adrian 2026-10-29): the title is for screen readers only.
    expect(dialog.querySelectorAll('p:not(.rjb-logo-word)')).toHaveLength(0);
    expect(
      within(dialog).getByRole('heading', { name: 'Sign in' }).closest('.sr-only'),
    ).not.toBeNull();
    expect(
      within(dialog)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Send link', 'Continue without an account']);
    expect(dialog.textContent).toBe(
      `${BRAND.name}Sign inEmailSend linkContinue without an account`,
    );
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
});
