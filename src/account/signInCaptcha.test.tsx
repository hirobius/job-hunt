// The sign-in screen with the CAPTCHA (#278). Off (no site key, the default): no hCaptcha script,
// no token, no extra line: the screen as it was. On: the script is asked for when the screen
// opens, each Send link and each Resend gets a fresh token that goes to `sendLink`, the token is
// reset after each attempt, and a blocked script or a failed check says so with the same button
// to try again. hCaptcha's API is faked at `window.hcaptcha`; the loader and widget are real.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { CloudSyncContext, type CloudSyncApi } from './accountContext';
import SignInDialog, { RESEND_COOLDOWN_S } from './SignInDialog';
import { SIGN_IN_ERRORS } from './signInErrors';
import { setCaptchaSiteKey } from './captchaKey';
import { forgetHcaptcha, HCAPTCHA_ONLOAD, HCAPTCHA_SCRIPT } from './hcaptcha';

const KEY = '10000000-ffff-ffff-ffff-000000000001'; // hCaptcha's public test site key
const g = window as unknown as Record<string, unknown>;

const scripts = () =>
  [...document.head.querySelectorAll<HTMLScriptElement>('script')].filter((s) =>
    s.src.startsWith(HCAPTCHA_SCRIPT),
  );

function fakeApi() {
  let n = 0;
  return {
    render: vi.fn((_el: HTMLElement, _c: Record<string, unknown>) => 'w1'),
    execute: vi.fn(async (_id: string, _c: { async: true }) => ({ response: `token-${++n}` })),
    reset: vi.fn((_id: string) => {}),
    remove: vi.fn((_id: string) => {}),
  };
}

function Harness({ sendLink }: { sendLink: CloudSyncApi['sendLink'] }) {
  const [open, setOpen] = useState(true);
  const api = {
    user: null,
    authResolved: true,
    status: '',
    settled: true,
    offline: false,
    sendLink,
    signInWithGoogle: async () => null,
    signInWithLinkedIn: async () => null,
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

const setup = (sendLink = vi.fn(async (_e: string, _t?: string) => null as string | null)) => {
  render(<Harness sendLink={sendLink} />);
  return { sendLink, dialog: screen.getByRole('dialog') };
};
const field = () => screen.getByRole('textbox', { name: 'Email' });
const submit = () => screen.getByRole('button', { name: 'Send link' });

beforeEach(() => {
  forgetHcaptcha();
  delete g.hcaptcha;
  delete g[HCAPTCHA_ONLOAD];
  scripts().forEach((s) => s.remove());
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('sign-in CAPTCHA: off by default', () => {
  it('loads no script, shows no hCaptcha line and sends the email alone', async () => {
    const { sendLink, dialog } = setup();
    expect(scripts()).toHaveLength(0);
    expect(within(dialog).queryByText(/hCaptcha/)).toBeNull();
    expect(dialog.querySelector('[class*="rjb-signin-captcha"]')).toBeNull();
    await userEvent.type(field(), 'me@example.com{Enter}');
    await screen.findByRole('dialog', { name: 'Check your email' });
    expect(sendLink.mock.calls).toEqual([['me@example.com']]); // one argument: no token
    expect(scripts()).toHaveLength(0);
  });
});

describe('sign-in CAPTCHA: on (a site key is set)', () => {
  beforeEach(() => setCaptchaSiteKey(KEY));

  it('asks for the script when the screen opens, and shows hCaptcha’s line with its two links', () => {
    const { dialog } = setup();
    expect(scripts()).toHaveLength(1);
    const line = within(dialog).getByText(/^This site is protected by hCaptcha/);
    // HDS InlineLink adds "(opens in new tab)" for an outside address.
    expect(line).toHaveTextContent(
      /^This site is protected by hCaptcha and its Privacy policy.* and Terms of service.* apply\.$/,
    );
    const privacy = within(line).getByRole('link', { name: /^Privacy policy/ });
    expect(privacy).toHaveAttribute('href', 'https://www.hcaptcha.com/privacy');
    expect(privacy).toHaveAttribute('target', '_blank');
    expect(privacy.getAttribute('rel')).toMatch(/noopener/);
    expect(within(line).getByRole('link', { name: /^Terms of service/ })).toHaveAttribute(
      'href',
      'https://www.hcaptcha.com/terms',
    );
  });

  it('Send link gets a token, passes it on and resets the widget; the challenge is drawn in the screen', async () => {
    const api = fakeApi();
    g.hcaptcha = api;
    const { sendLink, dialog } = setup();
    await userEvent.type(field(), 'me@example.com{Enter}');
    await screen.findByRole('dialog', { name: 'Check your email' });
    expect(sendLink.mock.calls).toEqual([['me@example.com', 'token-1']]);
    expect(api.reset).toHaveBeenCalledTimes(1);
    const [anchor, config] = api.render.mock.calls[0];
    expect(config).toMatchObject({ sitekey: KEY, size: 'invisible' });
    // Inside the modal screen: a challenge on <body> would be inert under the dialog.
    expect(dialog.contains(anchor)).toBe(true);
    expect(dialog.contains(config['challenge-container'] as HTMLElement)).toBe(true);
  });

  it('Resend gets a fresh token, and each attempt resets the widget', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const api = fakeApi();
    g.hcaptcha = api;
    const { sendLink } = setup();
    fireEvent.change(field(), { target: { value: 'me@example.com' } });
    await act(async () => {
      fireEvent.click(submit());
    });
    act(() => vi.advanceTimersByTime(RESEND_COOLDOWN_S * 1000));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Resend/ }));
    });
    expect(sendLink.mock.calls).toEqual([
      ['me@example.com', 'token-1'],
      ['me@example.com', 'token-2'],
    ]);
    expect(api.render).toHaveBeenCalledTimes(1); // one widget for both steps
    expect(api.reset).toHaveBeenCalledTimes(2);
  });

  it('a server error still resets the widget, so the next try has a new token', async () => {
    const api = fakeApi();
    g.hcaptcha = api;
    const sendLink = vi
      .fn(async (_e: string, _t?: string) => null as string | null)
      .mockResolvedValueOnce(SIGN_IN_ERRORS.captchaFailed);
    setup(sendLink);
    await userEvent.type(field(), 'me@example.com{Enter}');
    expect(await screen.findByText(SIGN_IN_ERRORS.captchaFailed)).toBeInTheDocument();
    expect(api.reset).toHaveBeenCalledTimes(1);
    await userEvent.click(submit());
    await screen.findByRole('dialog', { name: 'Check your email' });
    expect(sendLink.mock.calls.map((c) => c[1])).toEqual(['token-1', 'token-2']);
  });

  it('a blocked script says so, sends nothing, keeps the focus, and the same button tries again', async () => {
    const { sendLink } = setup();
    fireEvent.change(field(), { target: { value: 'me@example.com' } });
    submit().focus();
    await act(async () => {
      scripts()[0].dispatchEvent(new Event('error')); // the fetch from the screen opening fails
    });
    await userEvent.click(submit());
    await act(async () => {
      scripts()[0].dispatchEvent(new Event('error')); // and the fetch the send started
    });
    expect(await screen.findByText(SIGN_IN_ERRORS.captchaBlocked)).toBeInTheDocument();
    expect(sendLink).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument();
    expect(submit()).toHaveFocus(); // the retry is one press away
    // Try again: the script is fetched afresh, and this time it arrives.
    await userEvent.click(submit());
    expect(scripts()).toHaveLength(1);
    await act(async () => {
      g.hcaptcha = fakeApi();
      (g[HCAPTCHA_ONLOAD] as () => void)();
    });
    await screen.findByRole('dialog', { name: 'Check your email' });
    expect(sendLink.mock.calls).toEqual([['me@example.com', 'token-1']]);
    expect(screen.queryByText(SIGN_IN_ERRORS.captchaBlocked)).toBeNull();
  });

  it.each([
    ['challenge-closed', SIGN_IN_ERRORS.captchaClosed],
    ['challenge-expired', SIGN_IN_ERRORS.captchaExpired],
    ['network-error', SIGN_IN_ERRORS.offline],
    ['internal-error', SIGN_IN_ERRORS.captchaFailed],
  ])('a check that ends with %s shows its message and sends nothing', async (code, message) => {
    const api = fakeApi();
    api.execute.mockRejectedValueOnce(code);
    g.hcaptcha = api;
    const { sendLink } = setup();
    await userEvent.type(field(), 'me@example.com{Enter}');
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(sendLink).not.toHaveBeenCalled();
    expect(api.reset).toHaveBeenCalledTimes(1);
    // The same button tries again, with a new check.
    await userEvent.click(submit());
    await screen.findByRole('dialog', { name: 'Check your email' });
    expect(sendLink.mock.calls).toEqual([['me@example.com', 'token-1']]);
  });

  it('a challenge that leaves the focus on the page gives it back to the key that asked', async () => {
    const api = fakeApi();
    api.execute.mockImplementationOnce(async () => {
      (document.activeElement as HTMLElement | null)?.blur(); // as a closed challenge frame does
      throw 'challenge-closed';
    });
    g.hcaptcha = api;
    setup();
    fireEvent.change(field(), { target: { value: 'me@example.com' } });
    submit().focus();
    await act(async () => {
      fireEvent.click(submit());
    });
    expect(await screen.findByText(SIGN_IN_ERRORS.captchaClosed)).toBeInTheDocument();
    expect(submit()).toHaveFocus();
  });

  it('the widget leaves with the screen', async () => {
    const api = fakeApi();
    g.hcaptcha = api;
    setup();
    await userEvent.type(field(), 'me@example.com{Enter}');
    await screen.findByRole('dialog', { name: 'Check your email' });
    await userEvent.click(screen.getByRole('button', { name: 'Continue without an account' }));
    expect(api.remove).toHaveBeenCalledWith('w1');
  });
});
