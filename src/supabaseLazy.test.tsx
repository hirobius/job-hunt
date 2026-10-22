// supabase-js (~55 kB gz) loads only when it is needed: a stored session or a returning magic
// link at boot, else the first sign-in. A signed-out visit never fetches it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, ToastProvider } from '@hirobius/design-system';

const h = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return {
    createClient: () => {
      h.calls += 1;
      return createFakeSupabase().client;
    },
  };
});

beforeEach(() => {
  h.calls = 0;
  localStorage.clear();
  vi.resetModules(); // supabase.ts caches its client: each test boots a fresh app
});
afterEach(() => {
  cleanup();
  window.location.hash = '';
});

async function boot() {
  const { default: CloudSyncProvider } = await import('./account/CloudSyncProvider');
  const { useCloudSync } = await import('./account/accountContext');
  function Probe() {
    const { authResolved, sendLink } = useCloudSync();
    return (
      <>
        <span>{authResolved ? 'resolved' : 'pending'}</span>
        <Button onClick={() => void sendLink('me@example.com')}>Send</Button>
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
}

describe('the Supabase client loads lazily', () => {
  it('signed out: never built at boot, and the app still knows it is signed out', async () => {
    await import('./curation/curationStore');
    await boot();
    expect(await screen.findByText('resolved')).toBeInTheDocument();
    const { addCategory } = await import('./curation/curationStore');
    addCategory({ label: 'Local only' }); // a signed-out edit doesn't need it either
    await new Promise((r) => setTimeout(r, 20));
    expect(h.calls).toBe(0);
  });

  it('signed out: the first sign-in builds it, once', async () => {
    await boot();
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(h.calls).toBe(1));
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(h.calls).toBe(1);
  });

  it('a stored session builds it at boot', async () => {
    localStorage.setItem('sb-test-auth-token', '{}');
    await boot();
    await waitFor(() => expect(h.calls).toBe(1));
  });

  it('a returning magic link builds it at boot', async () => {
    window.location.hash = '#access_token=a&refresh_token=r&type=magiclink';
    await boot();
    await waitFor(() => expect(h.calls).toBe(1));
  });
});

describe('readAuthCallback', () => {
  it.each<[string, unknown]>([
    ['', null],
    ['#/queue', null],
    ['#access_token=a', null],
    ['#access_token=a&refresh_token=r&type=magiclink', { access_token: 'a', refresh_token: 'r' }],
  ])('%s', async (hash, out) => {
    const { readAuthCallback } = await import('./supabase');
    expect(readAuthCallback(hash)).toEqual(out);
  });
});

describe('no static import of supabase-js', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) return n === 'test' ? [] : files(p);
      return /\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
    });
  it('only type imports and the one dynamic import in supabase.ts', () => {
    const offenders = files('src').filter((f) =>
      /^import\s+(?!type\b)[^;]*from\s+'@supabase\/supabase-js'/m.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
