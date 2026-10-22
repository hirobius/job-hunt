// Back from OpenRouter: App finishes the connect, toasts, and returns to the page it started on
// with the code gone from the address bar. A forged or cancelled callback stores nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '@hirobius/design-system';

vi.mock('@supabase/supabase-js', async () => {
  const { createFakeSupabase } = await import('./test/fakeSupabase');
  return { createClient: () => createFakeSupabase().client };
});

import { ColorModeProvider } from './ColorMode';
import App from './App';
import { forgetKey, getKey } from './ai/connection';
import { startConnect } from './ai/oauth';
import { addJob, jobIdOf } from './store';

const URL_A = 'https://acme.example/jobs/cb-1';
const renderApp = () =>
  render(
    <ColorModeProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ColorModeProvider>,
  );

async function begin() {
  const back = `#/queue/${jobIdOf(URL_A)}?section=screening`;
  const auth = await startConnect({ origin: 'http://localhost:3000', path: '/', returnHash: back });
  const callback = new URL(new URL(auth).searchParams.get('callback_url')!);
  return { back, state: callback.searchParams.get('rf_ai')! };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  addJob(URL_A, 'Design systems lead');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  forgetKey();
  window.history.replaceState(null, '', '/');
});

describe('OpenRouter callback', () => {
  it('connects and returns to the Screening tab it started from', async () => {
    const { back, state } = await begin();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"key":"sk-or-v1-from-callback-01"}')),
    );
    window.history.replaceState(null, '', `/?rf_ai=${state}&code=abc123`);
    renderApp();
    expect(await screen.findByText(/AI connected/)).toBeInTheDocument();
    expect(getKey()).toBe('sk-or-v1-from-callback-01');
    await waitFor(() => expect(window.location.hash).toBe(back));
    expect(window.location.search).toBe('');
  });

  it('a forged state stores nothing and says so', async () => {
    await begin();
    const f = vi.fn(async () => new Response('{"key":"sk-or-v1-from-callback-01"}'));
    vi.stubGlobal('fetch', f);
    window.history.replaceState(null, '', `/?rf_ai=forged&code=abc123`);
    renderApp();
    expect(await screen.findByText(/isn’t from this tab/)).toBeInTheDocument();
    expect(getKey()).toBeNull();
    expect(f).not.toHaveBeenCalledWith(expect.stringContaining('auth/keys'), expect.anything());
    expect(window.location.search).toBe('');
  });

  it('a cancel stores nothing and says so', async () => {
    const { state } = await begin();
    window.history.replaceState(null, '', `/?rf_ai=${state}&error=access_denied`);
    renderApp();
    expect(await screen.findByText(/cancelled/)).toBeInTheDocument();
    expect(getKey()).toBeNull();
  });
});
