// Description reads stop at the deadline (#499): fillTexts gives up the reads still queued, so
// they never start and never hold a slot the next board's list read needs.
import { describe, expect, it, vi } from 'vitest';
import { createFetchJson } from './fetchFeed';
import { fillTexts } from './lightText';
import type { Posting } from './types';

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A fetch that answers only when told; it records each read's signal. */
function heldFetch() {
  const calls: { url: string; signal?: AbortSignal; answer: () => void }[] = [];
  const fetchImpl = vi.fn(
    (url: string, init?: RequestInit) =>
      new Promise<Response>((done, fail) => {
        const signal = init?.signal ?? undefined;
        signal?.addEventListener('abort', () => fail(signal.reason));
        calls.push({ url, signal, answer: () => done(json({ content: `<p>text ${url}</p>` })) });
      }),
  );
  return { calls, fetchImpl };
}

describe('a read given up (AbortSignal)', () => {
  it('never starts while it waits for a slot, and frees nothing it did not take', async () => {
    const { calls, fetchImpl } = heldFetch();
    const fetchJson = createFetchJson({ fetchImpl, now: () => 0, maxInFlight: 2 });
    const stop = new AbortController();
    const reads = [1, 2, 3, 4].map((i) =>
      fetchJson(`https://a.example/${i}`, { signal: stop.signal }).catch((e: unknown) => e),
    );
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    stop.abort();
    const out = await Promise.all(reads);
    expect(out.every((e) => e instanceof Error)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(calls.every((c) => c.signal?.aborted)).toBe(true);
    expect(fetchJson.inFlight()).toBe(0);
    // The slots are free again for the next read.
    const next = fetchJson('https://a.example/next');
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    calls[2].answer();
    await expect(next).resolves.toEqual({ content: '<p>text https://a.example/next</p>' });
  });

  it('a read already given up is refused at once', async () => {
    const fetchImpl = vi.fn(async () => json({}));
    const fetchJson = createFetchJson({ fetchImpl, now: () => 0 });
    await expect(
      fetchJson('https://a.example/1', { signal: AbortSignal.abort() }),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('fillTexts at its deadline', () => {
  const posting = (id: number): Posting => ({
    id: `greenhouse:acme:${id}`,
    source: 'greenhouse',
    title: `Design Systems Designer ${id}`,
    company: 'Acme',
    url: `https://boards.greenhouse.io/acme/jobs/${id}`,
    location: 'Remote',
    mode: 'remote',
    text: '',
  });

  it('keeps the texts read by then and gives up the reads still queued', async () => {
    const { calls, fetchImpl } = heldFetch();
    const fetchJson = createFetchJson({ fetchImpl, now: () => 0, maxInFlight: 2 });
    const postings = [1, 2, 3, 4, 5].map(posting);
    const done = fillTexts(postings, fetchJson, () => true, { deadlineMs: 30 });
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    calls[0].answer(); // one text lands in time; its slot goes to the third read
    await flush();
    await flush();
    const out = await done;
    expect(out.map((p) => Boolean(p.text))).toEqual([true, false, false, false, false]);
    await flush();
    // Only the reads that had a slot ever started; the ones on the network were cancelled.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(calls.slice(1).every((c) => c.signal?.aborted)).toBe(true);
    expect(fetchJson.inFlight()).toBe(0);
  });

  it('with no deadline it reads every text', async () => {
    const fetchImpl = vi.fn(async (url: string) => json({ content: `<p>${url}</p>` }));
    const fetchJson = createFetchJson({ fetchImpl, now: () => 0, maxInFlight: 2 });
    const out = await fillTexts([1, 2, 3].map(posting), fetchJson, () => true);
    expect(out.every((p) => p.text)).toBe(true);
  });
});
