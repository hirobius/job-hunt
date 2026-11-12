// "Continue with Google" (#482), bound to this browser with PKCE. The start keeps a random code
// verifier here and sends only its SHA-256 challenge; Google's return brings `?code=…`, which is worth
// a session only with that verifier (the token endpoint checks the pair). So nothing in a URL signs
// in on its own through the Google path: a link with someone's tokens still goes through the magic
// link's guard (confirm), and someone else's code cannot be swapped here. The same email's existing
// account comes back as the same user (Supabase links the identity): no merge ask.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, ToastProvider } from '@hirobius/design-system';
import { fakeAccessToken } from '../test/fakeSupabase';
import {
  challengeOf,
  exchangeCode,
  newVerifier,
  OAUTH_MAX_AGE_MS,
  readOAuthRequest,
  rememberOAuthRequest,
  takeOAuthVerifier,
} from './oauthPkce';
import { readAuthCode, stripAuthFragment } from '../authFragment';
import { GOOGLE_FAILED_MSG, LINKEDIN_FAILED_MSG } from './authLinkError';

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
const ATTACKER = 'attacker@example.com';

/** Supabase's token endpoint: a code is issued for one challenge and one account. */
const issued = new Map<string, { challenge: string; email: string }>();
const exchanges: { auth_code: string; code_verifier: string }[] = [];
async function issue(code: string, verifier: string, email: string) {
  issued.set(code, { challenge: await challengeOf(verifier), email });
}
const tokenEndpoint = vi.fn(async (url: string, init?: RequestInit) => {
  if (!String(url).includes('/auth/v1/token?grant_type=pkce'))
    return { ok: false, json: async () => ({}) };
  const body = JSON.parse(String(init?.body)) as { auth_code: string; code_verifier: string };
  exchanges.push(body);
  const grant = issued.get(body.auth_code);
  if (!grant || grant.challenge !== (await challengeOf(body.code_verifier)))
    return { ok: false, json: async () => ({ error: 'invalid_grant' }) };
  issued.delete(body.auth_code);
  return {
    ok: true,
    json: async () => ({
      access_token: fakeAccessToken(grant.email, { amr: 'oauth' }),
      refresh_token: 'r',
    }),
  };
});

beforeEach(() => {
  h.fake = null;
  h.opts = {};
  issued.clear();
  exchanges.length = 0;
  localStorage.clear();
  vi.stubGlobal('fetch', tokenEndpoint);
  vi.resetModules(); // authFragment reads the URL once per load: each test boots a fresh app
});
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await new Promise((r) => setTimeout(r, 50));
  history.replaceState(null, '', '/');
});

/** Boot the account seam the way a page load does, at `/` + `url` (a query and/or a hash). */
async function boot(url: string, opts: { job?: boolean } = {}) {
  history.replaceState(null, '', '/' + url);
  const store = await import('../store');
  if (opts.job) store.addJob('https://jobs.example.org/secret-role', 'Secret role');
  const { default: CloudSyncProvider } = await import('./CloudSyncProvider');
  const { useCloudSync } = await import('./accountContext');
  function Probe() {
    const { user, signInWithGoogle, signInWithLinkedIn } = useCloudSync();
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
        <Button onClick={() => void signInWithLinkedIn()}>LinkedIn</Button>
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
  it("asks for Google back to this origin's root, with the S256 challenge of a verifier kept here", async () => {
    await boot('');
    await userEvent.click(screen.getByRole('button', { name: 'Google' }));
    await waitFor(() => expect(h.fake?.oauthCalls).toHaveLength(1));
    const verifier = takeOAuthVerifier();
    expect(verifier).toMatch(/^[\w-]{43}$/);
    expect(h.fake!.oauthCalls[0]).toEqual({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/`,
        queryParams: {
          code_challenge: await challengeOf(verifier!),
          code_challenge_method: 's256',
        },
      },
    });
  });

  it('an error from Supabase comes back in plain words and drops the verifier', async () => {
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
  it("swaps the code with this browser's verifier, signs in, and leaves nothing in the URL", async () => {
    const v = newVerifier();
    rememberOAuthRequest(v);
    await issue('good-code', v, ME);
    await boot('?code=good-code#/find');
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(exchanges).toEqual([{ auth_code: 'good-code', code_verifier: v }]);
    expect(location.search).toBe('');
    expect(location.hash).toBe('#/find');
    expect(readOAuthRequest()).toBe(false); // used once
  });

  it('an abandoned Google start + a link with OAuth tokens for another account: asks first', async () => {
    // The victim started Google and gave up; the verifier is still here.
    rememberOAuthRequest(newVerifier());
    const link = `#access_token=${fakeAccessToken(ATTACKER, { amr: 'oauth' })}&refresh_token=r&expires_in=3600&token_type=bearer`;
    await boot(link, { job: true });
    expect(
      await screen.findByRole('dialog', { name: `Sign in as ${ATTACKER}?` }),
    ).toBeInTheDocument();
    expect(screen.getByText('out')).toBeInTheDocument();
    expect(exchanges).toEqual([]);
  });

  it("an abandoned Google start + someone else's code: the exchange is refused, no sign-in", async () => {
    rememberOAuthRequest(newVerifier());
    await issue('attacker-code', newVerifier(), ATTACKER); // issued for the attacker's own verifier
    await boot('?code=attacker-code', { job: true });
    expect(await screen.findByText(GOOGLE_FAILED_MSG)).toBeInTheDocument();
    expect(exchanges).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('out')).toBeInTheDocument();
    expect(h.fake?.tables.tracker ?? []).toHaveLength(0);
  });

  it('a code with no Google start here is never sent anywhere', async () => {
    await issue('stray-code', newVerifier(), ATTACKER);
    await boot('?code=stray-code');
    expect(await screen.findByText(GOOGLE_FAILED_MSG)).toBeInTheDocument();
    expect(exchanges).toEqual([]);
    expect(location.search).toBe('');
    expect(screen.getByText('out')).toBeInTheDocument();
  });

  it('an existing account with the same email (linked by Supabase) is not asked about again', async () => {
    const v = newVerifier();
    rememberOAuthRequest(v);
    await issue('good-code', v, ME);
    // This device already syncs with that account (first signed in with a magic link).
    localStorage.setItem('rjb_sync_base', JSON.stringify({ uid: `id-${ME}`, keys: {} }));
    await boot('?code=good-code', { job: true });
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
    await waitFor(() => expect(h.fake!.tables.tracker).toHaveLength(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a device with data and a new account: the merge guard still asks', async () => {
    const v = newVerifier();
    rememberOAuthRequest(v);
    await issue('good-code', v, ME);
    await boot('?code=good-code', { job: true });
    expect(await screen.findByRole('button', { name: 'Add to account' })).toBeInTheDocument();
  });
});

describe('Continue with LinkedIn (linkedin_oidc), the same PKCE binding', () => {
  it('asks Supabase for linkedin_oidc with the S256 challenge of a verifier kept here', async () => {
    await boot('');
    await userEvent.click(screen.getByRole('button', { name: 'LinkedIn' }));
    await waitFor(() => expect(h.fake?.oauthCalls).toHaveLength(1));
    const verifier = takeOAuthVerifier();
    expect(h.fake!.oauthCalls[0]).toEqual({
      provider: 'linkedin_oidc',
      options: {
        redirectTo: `${location.origin}/`,
        queryParams: {
          code_challenge: await challengeOf(verifier!),
          code_challenge_method: 's256',
        },
      },
    });
  });

  it("swaps LinkedIn's code with this browser's verifier, once", async () => {
    const v = newVerifier();
    rememberOAuthRequest(v, Date.now(), 'linkedin_oidc');
    await issue('li-code', v, ME);
    await boot('?code=li-code#/find');
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
    expect(exchanges).toEqual([{ auth_code: 'li-code', code_verifier: v }]);
    expect(readOAuthRequest()).toBe(false);
  });

  it("someone else's code after an abandoned LinkedIn start: refused, worded for LinkedIn", async () => {
    rememberOAuthRequest(newVerifier(), Date.now(), 'linkedin_oidc');
    await issue('attacker-code', newVerifier(), ATTACKER);
    await boot('?code=attacker-code', { job: true });
    expect(await screen.findByText(LINKEDIN_FAILED_MSG)).toBeInTheDocument();
    expect(screen.getByText('out')).toBeInTheDocument();
  });
});

describe('the pieces', () => {
  it('computes the RFC 7636 S256 challenge', async () => {
    expect(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
    expect(newVerifier()).not.toBe(newVerifier());
  });

  it('a Google start lasts 10 minutes, and its verifier is taken once', () => {
    rememberOAuthRequest('v1', 1000);
    expect(readOAuthRequest(1000 + OAUTH_MAX_AGE_MS)).toBe(true);
    expect(readOAuthRequest(1001 + OAUTH_MAX_AGE_MS)).toBe(false);
    expect(takeOAuthVerifier(1000)).toBe('v1');
    expect(takeOAuthVerifier(1000)).toBeNull();
  });

  it('the exchange posts the code and verifier, and a refusal or junk answer is null', async () => {
    const calls: [string, RequestInit][] = [];
    const ok = async (u: string, i: RequestInit) => {
      calls.push([u, i]);
      return { ok: true, json: async () => ({ access_token: 'a', refresh_token: 'b' }) };
    };
    expect(await exchangeCode('c', 'v', ok)).toEqual({ access_token: 'a', refresh_token: 'b' });
    expect(calls[0][0]).toMatch(/\/auth\/v1\/token\?grant_type=pkce$/);
    expect(JSON.parse(String(calls[0][1].body))).toEqual({ auth_code: 'c', code_verifier: 'v' });
    expect(
      await exchangeCode('c', 'v', async () => ({ ok: false, json: async () => ({}) })),
    ).toBeNull();
    expect(
      await exchangeCode('c', 'v', async () => ({ ok: true, json: async () => ({}) })),
    ).toBeNull();
    expect(
      await exchangeCode('c', 'v', async () => {
        throw new Error('offline');
      }),
    ).toBeNull();
  });

  it('strips the code from the query in place, keeping the rest of the URL', () => {
    const calls: string[] = [];
    const hist = {
      state: null,
      replaceState: (_s: unknown, _t: string, u: string) => calls.push(u),
    };
    stripAuthFragment({ hash: '#/find', pathname: '/', search: '?code=abc&x=1' }, hist);
    stripAuthFragment({ hash: '#/apply', pathname: '/', search: '?x=1' }, hist);
    expect(calls).toEqual(['/?x=1#/find']);
    expect(readAuthCode('?code=abc')).toBe('abc');
    expect(readAuthCode('?x=1')).toBeNull();
  });
});
