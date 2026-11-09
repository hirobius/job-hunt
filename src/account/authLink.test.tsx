// Login injection (security audit, High): a crafted `#access_token=<attacker>` link must never
// sign this browser in to someone else's account on its own, and this device's data must never go
// into an account it has not synced with unless the person says so. A magic link this browser
// asked for still signs in without a question; one opened on another device asks first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { fakeAccessToken } from '../test/fakeSupabase';
import {
  decideAuthLink,
  readSignInRequest,
  rememberSignInRequest,
  REQUEST_MAX_AGE_MS,
  tokenEmail,
} from './authLink';
import { readAuthTokens, stripAuthFragment } from '../authFragment';
import { deviceData, mergeQuestion } from './deviceData';
import { emptyBlob, writeBlob } from '../syncBlob';
import { buildReport } from '../errorReport';

const h = vi.hoisted(() => ({
  fake: null as null | ReturnType<typeof import('../test/fakeSupabase').createFakeSupabase>,
  opts: {} as Parameters<typeof import('../test/fakeSupabase').createFakeSupabase>[0],
  /** Runs as the client is made (before any read), to park a call. */
  onCreate: null as
    null | ((f: ReturnType<typeof import('../test/fakeSupabase').createFakeSupabase>) => void),
}));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('../test/fakeSupabase');
  return {
    createClient: () => {
      h.fake = createFakeSupabase(h.opts);
      h.onCreate?.(h.fake);
      return h.fake.client;
    },
  };
});

const ATTACKER = 'attacker@evil.test';
const ME = 'me@example.test';
const linkFor = (email: string) =>
  `#access_token=${fakeAccessToken(email)}&refresh_token=r&expires_in=3600&token_type=bearer&type=magiclink`;

beforeEach(() => {
  h.fake = null;
  h.opts = {};
  h.onCreate = null;
  localStorage.clear();
  vi.resetModules(); // authFragment reads the URL once per load: each test boots a fresh app
});
afterEach(async () => {
  cleanup();
  // A sheet unmounted while open pops its history entry: let that land before the next boot.
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
    const { user, settled, offline, stopped } = useCloudSync();
    // A page with its own h1, where focus lands after a confirm closes (#516 review).
    return (
      <main>
        <h1>Page</h1>
        <span>{user ? `in:${user.email}` : 'out'}</span>
        <span>{settled ? 'settled' : 'waiting'}</span>
        {offline && <span>offline</span>}
        {stopped && <span>stopped</span>}
      </main>
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

describe('an unsolicited sign-in link (no request from this browser)', () => {
  it('is blocked until confirmed, and Cancel drops it', async () => {
    const store = await boot(linkFor(ATTACKER), { job: true });
    // The tokens left the URL at once.
    expect(location.hash).toBe('');
    expect(location.href).not.toContain('access_token');
    expect(
      await screen.findByRole('dialog', { name: `Sign in as ${ATTACKER}?` }),
    ).toBeInTheDocument();
    expect(screen.getByText('out')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('out')).toBeInTheDocument();
    // Never signed in, nothing sent anywhere, this device's job untouched.
    expect((await h.fake?.client.auth.getSession())?.data.session ?? null).toBeNull();
    expect(h.fake?.tables.tracker ?? []).toEqual([]);
    expect(store.getAllJobs()).toHaveLength(1);
  });

  it('after the merge ask (Add or Don’t add), focus is on the page’s h1, never <body>', async () => {
    await boot(linkFor(ATTACKER), { job: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    await userEvent.click(await screen.findByRole('button', { name: "Don't add" }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Page' })),
    );
  });

  it('confirmed, it signs in, but this device’s data is not added unless asked (default: keep)', async () => {
    const store = await boot(linkFor(ATTACKER), { job: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    const ask = await screen.findByRole('alertdialog', {
      name: `Add this device's 1 job to ${ATTACKER}?`,
    });
    expect(ask).toBeInTheDocument();
    // While it asks, nothing is pulled or pushed.
    expect(h.fake!.tables.tracker ?? []).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: "Don't add" }));
    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument());
    expect(h.fake!.tables.tracker ?? []).toEqual([]);
    expect(store.getAllJobs().map((j) => j.label)).toEqual(['Secret role']);
  });

  it('the ask is a step of the sign-in screen: Sign in shows "Signed in", then the screen goes', async () => {
    await boot(linkFor(ME));
    const screenEl = await screen.findByRole('dialog', { name: `Sign in as ${ME}?` });
    // The sign-in layout: the brand on top, the security copy, Sign in and Cancel.
    expect(screenEl).toHaveClass('rjb-signin-screen');
    expect(screenEl).toHaveTextContent('Only continue if you asked for it.');
    expect(within(screenEl).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    await userEvent.click(within(screenEl).getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('heading', { name: 'Signed in' })).toBeInTheDocument();
    // Then it hands over to the app (the brand moves to the app bar) and closes.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 3000 });
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
  });

  it('Sign in says "Signing in…" until the session is real; a failure stays with the reason in place', async () => {
    // The server answers for another account than the link named: no session is kept.
    h.opts = { linkUser: () => 'someone.else@example.com' }; // pii-allow
    await boot(linkFor(ME));
    const screenEl = await screen.findByRole('dialog', { name: `Sign in as ${ME}?` });
    await userEvent.click(within(screenEl).getByRole('button', { name: 'Sign in' }));
    // Never "Signed in" for a session that isn't real (#515 review).
    expect(await within(screenEl).findByRole('alert')).toHaveTextContent(
      'That sign-in link could not be used.',
    );
    expect(screen.queryByRole('heading', { name: 'Signed in' })).toBeNull();
    expect(screen.getByRole('dialog', { name: `Sign in as ${ME}?` })).toBeInTheDocument();
    expect(screen.getByText('out')).toBeInTheDocument();
    // Said in place, not in a toast behind the screen.
    expect(screen.queryByText("Couldn't sign in")).toBeNull();
    // Cancel still drops it.
    await userEvent.click(within(screenEl).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('a link opened on another device (empty here) asks, then signs in and syncs', async () => {
    await boot(linkFor(ME));
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
    // Nothing on this device to ask about: the sync runs.
    await waitFor(() => expect(h.fake!.tables.tracker).toHaveLength(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a link whose token names no account is refused', async () => {
    await boot('#access_token=garbage&refresh_token=r');
    expect(location.hash).toBe('');
    expect(await screen.findByText(/could not be used/)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('out')).toBeInTheDocument();
  });

  it('an expired link is refused, even one this browser asked for (forged email + real refresh token)', async () => {
    rememberSignInRequest(ME);
    const tok = fakeAccessToken(ME, { exp: Math.floor(Date.now() / 1000) - 60 });
    await boot(`#access_token=${tok}&refresh_token=attacker-rt`);
    expect(await screen.findByText(/could not be used/)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('out')).toBeInTheDocument();
    expect(Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k))).toBe(false);
  });
});

describe('a link whose token was refreshed (TOKEN_REFRESHED, not SIGNED_IN)', () => {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('for an account never seen here, still asks before anything is pulled or pushed', async () => {
    h.opts = { linkEvent: 'TOKEN_REFRESHED' };
    const store = await boot(linkFor(ATTACKER), { job: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(
      await screen.findByRole('alertdialog', { name: `Add this device's 1 job to ${ATTACKER}?` }),
    ).toBeInTheDocument();
    // A focus re-pull and an edit (past the push debounce) send nothing while it asks.
    window.dispatchEvent(new Event('focus'));
    store.addJob('https://jobs.example.org/another', 'Another role');
    await wait(700);
    expect(h.fake!.tables.tracker ?? []).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: "Don't add" }));
    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument());
    window.dispatchEvent(new Event('focus'));
    await wait(700);
    expect(h.fake!.tables.tracker ?? []).toEqual([]);
    expect(
      store
        .getAllJobs()
        .map((j) => j.label)
        .sort(),
    ).toEqual(['Another role', 'Secret role']);
  });

  it('for the account already signed in here, stays silent and keeps syncing', async () => {
    rememberSignInRequest(ME);
    localStorage.setItem('rjb_sync_base', JSON.stringify({ uid: `id-${ME}`, keys: {} }));
    const store = await boot(linkFor(ME), { job: true });
    await waitFor(() => expect(h.fake!.tables.tracker).toHaveLength(1));
    h.fake!.signIn(`id-${ME}`, ME, 'TOKEN_REFRESHED');
    await wait(50);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText(`in:${ME}`)).toBeInTheDocument();
    store.addJob('https://jobs.example.org/another', 'Another role');
    await waitFor(() => expect(h.fake!.tables.tracker[0].data.jobs).toHaveLength(2));
  });
});

describe('settled waits for the first cloud read (#478 follow-up)', () => {
  it('signed in, it is not settled until the first pull has landed, even before it starts', async () => {
    rememberSignInRequest(ME);
    // Hold the account's first read of its cloud copy.
    let release = () => {};
    h.onCreate = (f) => (release = f.holdNext('tracker', 'select'));
    await boot(linkFor(ME));
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
    expect(screen.getByText('waiting')).toBeInTheDocument();
    release();
    expect(await screen.findByText('settled')).toBeInTheDocument();
  });

  it('a tab stopped by another tab while it reads is settled, never waiting forever', async () => {
    rememberSignInRequest(ME);
    h.onCreate = (f) => void f.holdNext('tracker', 'select'); // the read never answers
    await boot(linkFor(ME));
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
    expect(screen.getByText('waiting')).toBeInTheDocument();
    const { freezeTab } = await import('../tabAccount');
    freezeTab('signedOut'); // ('switched' also guards shared storage for the rest of the run)
    expect(await screen.findByText('settled')).toBeInTheDocument();
    expect(screen.getByText('stopped')).toBeInTheDocument();
  });

  it('a read that hangs says offline at its limit (Try again), and settles when it lands', async () => {
    const { PULL_LIMIT } = await import('./pullTimeout');
    expect(PULL_LIMIT.ms).toBe(15_000);
    PULL_LIMIT.ms = 400;
    rememberSignInRequest(ME);
    let release = () => {};
    h.onCreate = (f) => (release = f.holdNext('tracker', 'select'));
    await boot(linkFor(ME));
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
    expect(screen.queryByText('offline')).toBeNull();
    expect(await screen.findByText('offline')).toBeInTheDocument();
    expect(screen.getByText('waiting')).toBeInTheDocument();
    // The late answer still counts: the migrations waiting on settled run then.
    release();
    expect(await screen.findByText('settled')).toBeInTheDocument();
    expect(screen.queryByText('offline')).toBeNull();
  });
});

describe('a link this browser asked for', () => {
  it('whose account is not the email asked for pulls nothing, even on an empty device', async () => {
    const planted = writeBlob({
      ...emptyBlob(),
      jobs: [
        {
          url: 'https://jobs.example.org/planted',
          label: 'Planted role',
          status: 'Saved',
          added: '2026-10-01T00:00:00.000Z',
        },
      ],
    } as never);
    h.opts = {
      linkUser: () => ATTACKER,
      tables: { tracker: [{ user_id: `id-${ATTACKER}`, data: planted }] },
    };
    rememberSignInRequest(ME);
    const store = await boot(linkFor(ME));
    expect(await screen.findByText(/could not be used/)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByText('out')).toBeInTheDocument();
    expect(store.getAllJobs()).toEqual([]);
    expect(localStorage.getItem('rjb_shortlist') ?? '').not.toContain('planted');
    expect(h.fake!.tables.tracker).toHaveLength(1);
  });

  it('signs in without the confirm when the email matches', async () => {
    rememberSignInRequest('Me@Example.test');
    await boot(linkFor(ME));
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(location.hash).toBe('');
    // The request is used up.
    expect(readSignInRequest()).toBeNull();
  });

  it('asks when the link is for another email than the one asked for', async () => {
    rememberSignInRequest(ME);
    await boot(linkFor(ATTACKER));
    expect(
      await screen.findByRole('dialog', { name: `Sign in as ${ATTACKER}?` }),
    ).toBeInTheDocument();
  });

  it('first sign-in on a device with data: Add puts it in the account', async () => {
    rememberSignInRequest(ME);
    await boot(linkFor(ME), { job: true });
    await userEvent.click(await screen.findByRole('button', { name: 'Add to account' }));
    await waitFor(() => expect(h.fake!.tables.tracker).toHaveLength(1));
    expect(h.fake!.tables.tracker[0].data.jobs.map((j: { url: string }) => j.url)).toEqual([
      'https://jobs.example.org/secret-role',
    ]);
  });

  it('the account this device already syncs with is not asked about again', async () => {
    rememberSignInRequest(ME);
    localStorage.setItem('rjb_sync_base', JSON.stringify({ uid: `id-${ME}`, keys: {} }));
    await boot(linkFor(ME), { job: true });
    expect(await screen.findByText(`in:${ME}`)).toBeInTheDocument();
    await waitFor(() => expect(h.fake!.tables.tracker).toHaveLength(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

describe('the pieces', () => {
  it('reads the email a token names, and nothing from garbage', () => {
    expect(tokenEmail(fakeAccessToken(ME))).toBe(ME);
    expect(tokenEmail('garbage')).toBeNull();
    expect(tokenEmail('a.b.c')).toBeNull();
  });

  it('decides: matching fresh request → auto; anything else → confirm; no email → reject', () => {
    const t = { access_token: fakeAccessToken(ME), refresh_token: 'r' };
    expect(decideAuthLink(t, 'ME@example.test')).toEqual({ kind: 'auto', email: ME });
    expect(decideAuthLink(t, null)).toEqual({ kind: 'confirm', email: ME });
    expect(decideAuthLink(t, ATTACKER)).toEqual({ kind: 'confirm', email: ME });
    expect(decideAuthLink({ access_token: 'x', refresh_token: 'r' }, ME)).toEqual({
      kind: 'reject',
    });
    // No expiry, or one already past: refused (supabase-js would refresh it unchecked).
    const now = Date.now();
    const past = { access_token: fakeAccessToken(ME, { exp: now / 1000 - 1 }), refresh_token: 'r' };
    const noExp = { access_token: fakeAccessToken(ME, { exp: null }), refresh_token: 'r' };
    expect(decideAuthLink(past, ME, now)).toEqual({ kind: 'reject' });
    expect(decideAuthLink(noExp, null, now)).toEqual({ kind: 'reject' });
  });

  it('a sign-in request lasts an hour', () => {
    rememberSignInRequest(ME, 1000);
    expect(readSignInRequest(1000 + REQUEST_MAX_AGE_MS)).toBe(ME);
    expect(readSignInRequest(1001 + REQUEST_MAX_AGE_MS)).toBeNull();
  });

  it('strips a token fragment in place, and leaves a route alone', () => {
    const calls: string[] = [];
    const hist = {
      state: null,
      replaceState: (_s: unknown, _t: string, u: string) => calls.push(u),
    };
    stripAuthFragment({ hash: linkFor(ME), pathname: '/', search: '?x=1' }, hist);
    stripAuthFragment({ hash: '#refresh_token=r', pathname: '/', search: '' }, hist);
    stripAuthFragment({ hash: '#/apply', pathname: '/', search: '' }, hist);
    expect(calls).toEqual(['/?x=1', '/']);
    expect(readAuthTokens('#/apply')).toBeNull();
  });

  it('a crash report never carries a token', () => {
    const tok = fakeAccessToken(ME);
    const r = buildReport('error', new Error(`bad hash #access_token=${tok}&refresh_token=rt1`), {
      hash: linkFor(ME),
      userAgent: '',
    });
    expect(JSON.stringify(r)).not.toContain(tok);
    expect(JSON.stringify(r)).not.toContain('rt1');
    expect(r.route).toBe('');
  });

  it('counts what this device holds, ignoring starter templates and an empty kit', () => {
    const fresh = {
      ...emptyBlob(),
      copydeck: [{ id: 'tpl-followup' }],
      documents: [{ id: 'snippet-tpl-followup' }],
    } as never;
    expect(deviceData(fresh, 0)).toEqual({ jobs: 0, any: false });
    expect(deviceData(emptyBlob(), 1).any).toBe(true);
    // Per-track settings are this device's data too (work mode, sweep titles).
    expect(deviceData({ ...emptyBlob(), modes: { t1: 'remote' } } as never, 0).any).toBe(true);
    expect(
      deviceData({ ...emptyBlob(), sweeps: { t1: { titles: [], on: [] } } } as never, 0).any,
    ).toBe(true);
    expect(mergeQuestion({ jobs: 2, any: true }, ME)).toBe(`Add this device's 2 jobs to ${ME}?`);
    expect(mergeQuestion({ jobs: 0, any: true }, ME)).toBe(
      `Add this device's saved data to ${ME}?`,
    );
  });
});
