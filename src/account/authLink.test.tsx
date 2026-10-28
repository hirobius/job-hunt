// Login injection (security audit, High): a crafted `#access_token=<attacker>` link must never
// sign this browser in to someone else's account on its own, and this device's data must never go
// into an account it has not synced with unless the person says so. A magic link this browser
// asked for still signs in without a question; one opened on another device asks first.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

const ATTACKER = 'attacker@evil.test';
const ME = 'me@example.test';
const linkFor = (email: string) =>
  `#access_token=${fakeAccessToken(email)}&refresh_token=r&expires_in=3600&token_type=bearer&type=magiclink`;

beforeEach(() => {
  h.fake = null;
  h.opts = {};
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
    const { user } = useCloudSync();
    return <span>{user ? `in:${user.email}` : 'out'}</span>;
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
      await screen.findByRole('alertdialog', { name: `Sign in as ${ATTACKER}?` }),
    ).toBeInTheDocument();
    expect(screen.getByText('out')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('out')).toBeInTheDocument();
    // Never signed in, nothing sent anywhere, this device's job untouched.
    expect((await h.fake?.client.auth.getSession())?.data.session ?? null).toBeNull();
    expect(h.fake?.tables.tracker ?? []).toEqual([]);
    expect(store.getAllJobs()).toHaveLength(1);
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
      await screen.findByRole('alertdialog', { name: `Sign in as ${ATTACKER}?` }),
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
    stripAuthFragment({ hash: '#/queue', pathname: '/', search: '' }, hist);
    expect(calls).toEqual(['/?x=1', '/']);
    expect(readAuthTokens('#/queue')).toBeNull();
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
