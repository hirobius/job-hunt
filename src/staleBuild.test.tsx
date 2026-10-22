// A tab left open across a deploy: a late chunk (a route view, supabase-js) is gone from the
// server. The app says a new version is ready, with Reload, instead of crashing; the crash reporter
// only hears about it when the reload didn't fix it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';
import { isChunkLoadError, STALE_RELOAD_KEY, staleReloadFailed } from './chunkError';
import { importFresh, reloadForNewVersion, resetStaleBuild, STALE_MSG } from './staleBuild';
import StaleBuildNotice from './StaleBuildNotice';
import { ErrorBoundary } from './ErrorBoundary';
import { createReporter } from './errorReport';

const chromeChunk = new TypeError(
  'Failed to fetch dynamically imported module: https://roleforge-app.vercel.app/assets/JobPage-abc123.js',
);

beforeEach(() => {
  sessionStorage.clear();
  resetStaleBuild();
});
afterEach(cleanup);

describe('stale tab after a deploy', () => {
  it('knows a missing chunk from any other error', () => {
    expect(isChunkLoadError(chromeChunk)).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: x.js'))).toBe(
      true,
    );
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('a lazy chunk that fails raises one notice with Reload, and the import still rejects', async () => {
    const reload = vi.fn();
    render(
      <ToastProvider>
        <StaleBuildNotice reload={reload} />
      </ToastProvider>,
    );
    expect(screen.queryByText(STALE_MSG)).toBeNull();
    const load = importFresh(() => Promise.reject(chromeChunk));
    await act(async () => {
      await expect(load()).rejects.toBe(chromeChunk);
      await expect(load()).rejects.toBe(chromeChunk);
    });
    expect(await screen.findAllByText(STALE_MSG)).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(STALE_RELOAD_KEY)).not.toBeNull();
  });

  it('any other import failure (offline) raises no notice', async () => {
    render(
      <ToastProvider>
        <StaleBuildNotice reload={vi.fn()} />
      </ToastProvider>,
    );
    await act(async () => {
      await expect(importFresh(() => Promise.reject(new Error('boom')))()).rejects.toThrow();
    });
    expect(screen.queryByText(STALE_MSG)).toBeNull();
  });

  it('a route view whose chunk is gone shows the calm notice, not "Something broke"', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Gone(): never {
      throw chromeChunk;
    }
    render(
      <ErrorBoundary>
        <Gone />
      </ErrorBoundary>,
    );
    expect(screen.getByText(STALE_MSG)).toBeInTheDocument();
    expect(screen.queryByText('Something broke')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('reports a missing chunk only when a reload for the new version did not fix it', async () => {
    const send = vi.fn(() => Promise.resolve());
    createReporter(send)('rejection', chromeChunk);
    await Promise.resolve();
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();

    reloadForNewVersion(() => {});
    expect(staleReloadFailed()).toBe(true);
    createReporter(send)('rejection', chromeChunk);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    // Long after that reload, a new deploy gets its own quiet reload again.
    expect(staleReloadFailed(Date.now() + 10 * 60 * 1000)).toBe(false);
  });
});
