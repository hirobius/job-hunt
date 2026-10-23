import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@hirobius/design-system';

const m = vi.hoisted(() => ({ watchAdeleBoards: vi.fn() }));
vi.mock('./feed/adele', async (orig) => ({
  ...(await orig<typeof import('./feed/adele')>()),
  watchAdeleBoards: m.watchAdeleBoards,
}));

import AdeleSeed from './AdeleSeed';
import { adeleNames } from './feed/adele';

let progress: (r: object) => void = () => {};
let finish: (r: object) => void = () => {};
let fail: (e: Error) => void = () => {};
let signal: AbortSignal | undefined;
beforeEach(() => {
  m.watchAdeleBoards.mockReset().mockImplementation((_c, _n, o) => {
    progress = o.onProgress;
    signal = o.signal;
    return new Promise((res, rej) => {
      finish = res;
      fail = rej;
    });
  });
});
afterEach(cleanup);

let n = 0;
const renderSeed = (cat = `t${++n}`) =>
  render(
    <ToastProvider>
      <ul aria-label="More ways">
        <AdeleSeed categoryId={cat} boardUrls={['https://jobs.lever.co/x']} />
      </ul>
    </ToastProvider>,
  );
const addButton = () =>
  screen.getByRole('button', { name: /^Add companies with public design systems/ });
const line = () => within(screen.getByRole('list', { name: 'More ways' })).getByRole('status');
const RUN = { watched: 2, missed: 1, unknown: 0, alreadyWatched: 0, done: 3, total: 101 };
const DONE = { watched: 30, missed: 60, unknown: 5, alreadyWatched: 6, done: 101, total: 101 };

describe('Add companies with public design systems', () => {
  it('names the count, credits Adele and its licence, and links the source', () => {
    renderSeed();
    const count = adeleNames().length;
    expect(screen.getByText(`Add companies with public design systems (${count})`)).toBeVisible();
    expect(screen.getByText(/UXPin’s list of public design systems \(MIT\)/)).toBeVisible();
    expect(screen.getByRole('link', { name: /Adele on GitHub/ })).toHaveAttribute(
      'href',
      'https://github.com/uxpin/adele',
    );
  });

  it('runs the names through the probe with the watched boards, shows progress, then what came of it', async () => {
    const user = userEvent.setup();
    renderSeed('a');
    await user.click(addButton());
    const [cat, names, opts] = m.watchAdeleBoards.mock.calls[0];
    expect(cat).toBe('a');
    expect(names).toEqual(adeleNames());
    expect(opts.boardUrls).toEqual(['https://jobs.lever.co/x']);
    act(() => progress(RUN));
    expect(line()).toHaveTextContent('Checked 3 of 101 · watching 2');
    expect(screen.queryByRole('button', { name: /^Add companies/ })).not.toBeInTheDocument();
    await act(async () => finish(DONE));
    expect(line()).toHaveTextContent(
      'Watching 30 new boards. 6 already watched, 60 with no public board, 5 couldn’t be checked.',
    );
    expect(await screen.findByText('Watching 30 new boards from Adele')).toBeInTheDocument();
  });

  it('keeps going when the row leaves, and shows where it is on return', async () => {
    const user = userEvent.setup();
    renderSeed('b');
    await user.click(addButton());
    cleanup();
    expect(signal?.aborted).toBe(false);
    act(() => progress(RUN));
    renderSeed('b');
    expect(line()).toHaveTextContent('Checked 3 of 101 · watching 2');
    await act(async () => finish(DONE));
    expect(line()).toHaveTextContent('Watching 30 new boards.');
  });

  it('Cancel stops the run and keeps what it watched', async () => {
    const user = userEvent.setup();
    renderSeed('c');
    await user.click(addButton());
    act(() => progress(RUN));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => finish(RUN));
    expect(line()).toHaveTextContent('Stopped after 3 of 101. Watching 2 new boards.');
    expect(addButton()).toBeEnabled();
  });

  it('a run that throws says so instead of failing quietly', async () => {
    const user = userEvent.setup();
    renderSeed('d');
    await user.click(addButton());
    act(() => progress(RUN));
    await act(async () => fail(new Error('quota')));
    expect(line()).toHaveTextContent('The check stopped after 3 of 101.');
    expect(
      await screen.findByText('The check stopped. Try again in a minute.'),
    ).toBeInTheDocument();
  });
});
