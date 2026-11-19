// #448 (server scan every 15 min): a board read that hit a rate limit (429), a server error (5xx)
// or a timeout is read once more after a short wait, inside the same invocation, before it is
// logged as failed. A 404 or any other 4xx is an answer and is never retried. Pure, so the edge
// function and its tests share it (`.ts` specifiers: Deno loads it too).
import type { ReadOutcome } from './sync.ts';

/** How long the sync waits before the second read (well inside a slice's wall-clock budget). */
export const RETRY_WAIT_MS = 2000;

/** True when a failed read is worth one more try. */
export function retryable(r: Pick<ReadOutcome, 'ok' | 'status' | 'error'>): boolean {
  if (r.ok) return false;
  if (r.status === 429 || (r.status !== undefined && r.status >= 500)) return true;
  if (r.status !== undefined) return false;
  // No status: the request never got an answer. Timeouts and dropped connections are worth it.
  return /timeout|timed out|aborted|network|connection|reset|ECONN/i.test(r.error ?? '');
}

/** Reads `items`, then reads once more the ones whose outcome is retryable, after `wait`. The
 *  second answer replaces the first (ok or not), in the same order. */
export async function readWithRetry<T, R extends Pick<ReadOutcome, 'ok' | 'status' | 'error'>>(
  items: T[],
  read: (items: T[]) => Promise<R[]>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ reads: R[]; retried: number }> {
  const first = await read(items);
  const again = first.flatMap((r, i) => (retryable(r) ? [i] : []));
  if (!again.length) return { reads: first, retried: 0 };
  await wait(RETRY_WAIT_MS);
  const second = await read(again.map((i) => items[i]));
  const reads = first.slice();
  again.forEach((at, k) => {
    if (second[k]) reads[at] = second[k];
  });
  return { reads, retried: again.length };
}
