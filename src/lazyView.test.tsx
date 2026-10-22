// lazyView: a route view loaded on demand. Before its chunk arrives it suspends (the Suspense
// fallback shows); once loaded — or preloaded — it renders at once, and a mounted view is never
// swapped for another element type (that would remount it and drop its state).
import { Suspense, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { Button } from '@hirobius/design-system';
import { lazyView } from './lazyView';

function Counter({ label }: { label: string }) {
  const [n, setN] = useState(0);
  return <Button onClick={() => setN(n + 1)}>{`${label} ${n}`}</Button>;
}

const deferred = () => {
  let resolve!: (m: { default: typeof Counter }) => void;
  const promise = new Promise<{ default: typeof Counter }>((r) => (resolve = r));
  return { promise, resolve };
};

afterEach(cleanup);

describe('lazyView', () => {
  it('shows the fallback until the chunk loads, then the view', async () => {
    const d = deferred();
    const View = lazyView(() => d.promise);
    render(
      <Suspense fallback={<p>Loading</p>}>
        <View label="count" />
      </Suspense>,
    );
    expect(screen.getByText('Loading')).toBeInTheDocument();
    await act(async () => d.resolve({ default: Counter }));
    expect(await screen.findByRole('button', { name: 'count 0' })).toBeInTheDocument();
  });

  it('a preloaded view renders synchronously, with no fallback', async () => {
    const View = lazyView(async () => ({ default: Counter }));
    await View.preload();
    render(
      <Suspense fallback={<p>Loading</p>}>
        <View label="count" />
      </Suspense>,
    );
    expect(screen.queryByText('Loading')).toBeNull();
    expect(screen.getByRole('button', { name: 'count 0' })).toBeInTheDocument();
  });

  it('keeps its state across parent re-renders after loading', async () => {
    const d = deferred();
    const View = lazyView(() => d.promise);
    function Parent() {
      const [tick, setTick] = useState(0);
      return (
        <>
          <Button onClick={() => setTick(tick + 1)}>{`rerender ${tick}`}</Button>
          <Suspense fallback={<p>Loading</p>}>
            <View label="count" />
          </Suspense>
        </>
      );
    }
    render(<Parent />);
    await act(async () => d.resolve({ default: Counter }));
    await userEvent.click(await screen.findByRole('button', { name: 'count 0' }));
    await userEvent.click(screen.getByRole('button', { name: /^rerender/ }));
    expect(screen.getByRole('button', { name: 'count 1' })).toBeInTheDocument();
  });
});

describe('the shell loads its route views on demand', () => {
  it('App imports no view module statically', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    for (const v of ['TrackerView', 'JobPage', 'ApplyMode', 'CompanyPage', 'DiscoverView'])
      expect(app).not.toMatch(new RegExp(`^import \\w+ from '\\./${v}';`, 'm'));
  });
});
