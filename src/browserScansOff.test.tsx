// Scans run on the server only (#756, ADR 0012), phase 1: with browser scans off, the browser
// reads no job source. A fetch spy sees no request on Review load and app open (signed in, the
// scan on open turned on as main.tsx does), or after a company is followed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';

const h = await vi.hoisted(async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { fake: createFakeSupabase() };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.fake.client }));

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { signInAtBoot } from './test/signedIn';
import { setBrowserScans } from './feed/browserScans';
import { setScanOnOpen } from './feed/scanOnOpenFlag';
import { resetScan } from './feed/autoScan';
import { saveProfile } from './profile';
import { followBoard } from './sources';
import { parseBoardUrl } from './feed/sources/ats';

const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

let fetchSpy: ReturnType<typeof vi.spyOn>;
const asked = () => fetchSpy.mock.calls.map(([u]) => String(u instanceof Request ? u.url : u));

beforeEach(() => {
  localStorage.clear();
  h.fake.reset();
  resetScan();
  saveProfile({ titles: ['Design Systems Engineer'], mode: 'remote' });
  window.location.hash = '#/review';
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}', { status: 404 }) as never);
});
afterEach(() => {
  cleanup();
  fetchSpy.mockRestore();
  setBrowserScans(true);
  setScanOnOpen(false);
});

describe('browser scans off (#756)', () => {
  it('reads no job source on Review load, on app open, or after a Follow', async () => {
    setBrowserScans(false);
    setScanOnOpen(true);
    signInAtBoot(h.fake);
    renderApp();
    // Signed in, Review reads only the server's rows: none here, so its empty state.
    await screen.findByRole('heading', { level: 1, name: 'Review' });
    await act(() => new Promise((r) => setTimeout(r, 1500)));
    expect(asked()).toEqual([]);
    act(() => {
      followBoard(parseBoardUrl('https://boards.greenhouse.io/acme')!, 'Acme');
    });
    await act(() => new Promise((r) => setTimeout(r, 1500)));
    expect(asked()).toEqual([]);
  });

  it('with browser scans on (the default), the same visit reads in the browser', async () => {
    setScanOnOpen(true);
    signInAtBoot(h.fake);
    renderApp();
    await act(() => new Promise((r) => setTimeout(r, 1500)));
    act(() => {
      followBoard(parseBoardUrl('https://boards.greenhouse.io/acme')!, 'Acme');
    });
    await act(() => new Promise((r) => setTimeout(r, 1500)));
    expect(asked().length).toBeGreaterThan(0);
  });
});
