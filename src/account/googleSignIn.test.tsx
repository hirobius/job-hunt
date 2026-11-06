// "Continue with Google" (#482). The OAuth round trip uses the implicit flow, like the magic link:
// it comes back on `#access_token=…`, and authFragment.ts takes the tokens. A Google sign-in this
// browser started (in the last 10 minutes) signs in without the confirm; a token that did not come
// from OAuth, or one with no Google start here, still asks (login injection guard). The same email's
// existing account comes back as the same user (Supabase links the identity), so this device is not
// asked about its data again. The magic link is unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, ToastProvider } from '@hirobius/design-system';
import { fakeAccessToken } from '../test/fakeSupabase';
import {
  decideAuthLink,
  OAUTH_MAX_AGE_MS,
  readOAuthRequest,
  rememberOAuthRequest,
  tokenFromOAuth,
} from './authLink';

const h = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import('../test/fakeSupabase').createFakeSupabase>,
  opts: {} as Parameters<typeof import('../test/fakeSupabase').createFakeSupabase>[0],
}));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('../test/fakeSupabase');
  return {
    createClient: () => {
      h.fake = createFakeSupabase(h.opts);
      return h.fake.client;
    },
  };
});

const ME = 'me@example.com';
const OTHER = 'other@example.com';
const googleReturn = (email: string, amr = 'oauth') =>
  `#access_token=${fakeAccessToken(email, { amr })}&refresh_token=r&expires_in=3600&token_type=bearer&provider_token=p`;

beforeEach(() => {
  h.fake = null;
  h.opts = {};
  localStorage.clear();
  vi.resetModules(); // authFragment reads the URL once per load: each test boots a fresh app
});
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 50));
  history.replaceState(null, '', '/');
});

/** Boot the account seam the way a page load does, with `hash` in the address bar. */
async function boot(hash: string, opts: { job?: boolean } = {}) {
  history.replaceState(null, '', '/' + hash);
  const store = await import('../store');
  if (opts.job) store.addJob('https://jobs.example.org/secret-role', 'Secret role');
  const { default: CloudSyncProvider } = await import('./CloudSyncProvider');
  const { useCloudSync } = await import('./accountContext');
  function Probe() {
    const { user, signInWithGoogle } = useCloudSync();
    return (
      <>
        <span>{user ? `in:${user.email}` : 'out'}</span>
        <Button
          onClick={() =>
            void signInWithGoogle().then((e) => {
              if (e) document.body.dataset.googleError = e;
            })
          }
        >
          Google
        </Button>
      </>
    );
  }
  render(
    <ToastProvider>
      <CloudSyncProvider>
        <Probe />
      </CloudSyncProvider>
    </ToastProvider>,
  );
  return store;
}

describe('starting a Google sign-in', () => {
  it("asks Supabase for Google, back to this origin's root, and notes the start", async () => {
    await boot('');
    await userEvent.click(screen.getByRole('button', { name: 'Google' }));
    await waitFor(() => expect(h.fake?.oauthCalls).toHaveLength(1));
    expect(h.fake!.oauthCalls[0]).toEqual({
      provider: 'google',
      options: { redirectTo: `${location.origin}/` },
    });
    expect(readOAuthRequest()).toBe(true);
  });

  it('an error from Supabase comes back in plain words and drops the note', async () => {
    h.opts = { oauthError: 'Failed to fetch' };
    await boot('');
    await userEvent.click(screen.getByRole('button', { name: 'Google' }));
    await waitFor(() => expect(document.body.dataset.googleError).toBeTruthy());
    expect(document.body.dataset.googleError).not.toMatch(/fetch/i);
    expect(readOAuthRequest()).toBe(false);
    delete document.body.dataset.googleError;
  });
});

describe('coming back from Google', () => {
  it('signs in without the confirm when this browser started it, and uses the note up', async () => {
    rememberOAuthRequest();
    await boot(googleReturn(ME));
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(location.hash).toBe('');
    expect(readOAuthRequest()).toBe(false);
  });

  it('asks first when this browser never started one (a crafted link)', async () => {
    await boot(googleReturn(OTHER));
    expect(
      await screen.findByRole('alertdialog', { name: `Sign in as ${OTHER}?` }),
    ).toBeInTheDocument();
  });

  it('asks first when the token did not come from OAuth, even after a Google start', async () => {
    rememberOAuthRequest();
    await boot(googleReturn(OTHER, 'otp'));
    expect(
      await screen.findByRole('alertdialog', { name: `Sign in as ${OTHER}?` }),
    ).toBeInTheDocument();
  });

  it('an existing account with the same email (linked by Supabase) is not asked about again', async () => {
    rememberOAuthRequest();
    // This device already syncs with that account (first signed in with a magic link).
    localStorage.setItem('rjb_sync_base', JSON.stringify({ uid: `id-${ME}`, keys: {} }));
    await boot(googleReturn(ME), { job: true });
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
    await waitFor(() => expect(h.fake!.tables.tracker).toHaveLength(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a device with data and a new account: the merge guard still asks', async () => {
    rememberOAuthRequest();
    await boot(googleReturn(ME), { job: true });
    expect(await screen.findByRole('button', { name: 'Add to account' })).toBeInTheDocument();
  });
});

describe('the pieces', () => {
  it('reads OAuth from the token amr, and nothing else', () => {
    expect(tokenFromOAuth(fakeAccessToken(ME, { amr: 'oauth' }))).toBe(true);
    expect(tokenFromOAuth(fakeAccessToken(ME, { amr: 'otp' }))).toBe(false);
    expect(tokenFromOAuth(fakeAccessToken(ME))).toBe(false);
    expect(tokenFromOAuth('garbage')).toBe(false);
  });

  it('decides: Google start + OAuth token → auto; either missing → confirm', () => {
    const now = Date.now();
    const google = { access_token: fakeAccessToken(ME, { amr: 'oauth' }), refresh_token: 'r' };
    const link = { access_token: fakeAccessToken(ME, { amr: 'otp' }), refresh_token: 'r' };
    expect(decideAuthLink(google, null, now, true)).toEqual({ kind: 'auto', email: ME });
    expect(decideAuthLink(google, null, now, false)).toEqual({ kind: 'confirm', email: ME });
    expect(decideAuthLink(link, null, now, true)).toEqual({ kind: 'confirm', email: ME });
    // An expired token is refused whatever started it.
    const past = {
      access_token: fakeAccessToken(ME, { amr: 'oauth', exp: now / 1000 - 1 }),
      refresh_token: 'r',
    };
    expect(decideAuthLink(past, null, now, true)).toEqual({ kind: 'reject' });
  });

  it('a Google start lasts 10 minutes', () => {
    rememberOAuthRequest(1000);
    expect(readOAuthRequest(1000 + OAUTH_MAX_AGE_MS)).toBe(true);
    expect(readOAuthRequest(1001 + OAUTH_MAX_AGE_MS)).toBe(false);
  });
});
