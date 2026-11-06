import { describe, expect, it, vi } from 'vitest';
import { readWithRetry, retryable, RETRY_WAIT_MS } from './retry';

type R = { ok: boolean; status?: number; error?: string; id: string };

describe('retryable', () => {
  it.each([
    [{ ok: false, status: 429 }, true],
    [{ ok: false, status: 503 }, true],
    [{ ok: false, error: 'TimeoutError: The operation timed out' }, true],
    [{ ok: false, error: 'TypeError: network error' }, true],
    [{ ok: false, status: 404 }, false],
    [{ ok: false, status: 403 }, false],
    [{ ok: false, error: 'SyntaxError: bad JSON' }, false],
    [{ ok: true }, false],
  ])('%j → %s', (r, want) => expect(retryable(r)).toBe(want));
});

describe('readWithRetry', () => {
  it('reads the retryable ones once more after the wait, keeping order', async () => {
    const wait = vi.fn(async () => {});
    const calls: string[][] = [];
    const read = async (items: string[]): Promise<R[]> => {
      calls.push(items);
      return items.map((id) =>
        calls.length === 1 && id !== 'a'
          ? { id, ok: false, status: id === 'b' ? 429 : 404 }
          : { id, ok: true },
      );
    };
    const { reads, retried } = await readWithRetry(['a', 'b', 'c'], read, wait);
    expect(calls).toEqual([['a', 'b', 'c'], ['b']]);
    expect(wait).toHaveBeenCalledWith(RETRY_WAIT_MS);
    expect(retried).toBe(1);
    expect(reads.map((r) => [r.id, r.ok, r.status])).toEqual([
      ['a', true, undefined],
      ['b', true, undefined],
      ['c', false, 404],
    ]);
  });

  it('does not wait when nothing needs a retry', async () => {
    const wait = vi.fn(async () => {});
    const { retried } = await readWithRetry(['a'], async () => [{ id: 'a', ok: true }], wait);
    expect(retried).toBe(0);
    expect(wait).not.toHaveBeenCalled();
  });

  it('a second failure stays a failure', async () => {
    const { reads } = await readWithRetry(
      ['a'],
      async () => [{ id: 'a', ok: false, status: 429 }],
      async () => {},
    );
    expect(reads[0]).toMatchObject({ ok: false, status: 429 });
  });
});
