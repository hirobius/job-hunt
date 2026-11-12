// A read keeps no text for what its inclusion rule leaves out (slimRead, sign-in memory). When only
// the rule changes (same titles and boards), the Feed reads again in full: folding into the old,
// slimmed read would keep a posting the new rule lets in by its description hidden (review of #656).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { IncludeRule } from './mustInclude';
import type { PostingReader } from './reader';
import type { Posting } from './types';

const rule = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('./profile', async (orig) => {
  const m = await orig<typeof import('./profile')>();
  return {
    ...m,
    searchProfileOf: (...a: Parameters<typeof m.searchProfileOf>) => {
      const p = m.searchProfileOf(...a);
      return rule.current ? { ...p, include: rule.current as IncludeRule } : p;
    },
  };
});

const { useFeed } = await import('./useFeed');
const { saveProfile, replaceProfiles } = await import('../profile');

const posting = (id: string, title: string, text: string): Posting =>
  ({
    id,
    title,
    text,
    company: `Co ${id}`,
    url: `https://example.com/${id}`,
    location: 'Remote',
    mode: 'remote',
    source: 'greenhouse',
  }) as Posting;
const postings = [
  posting('a', 'Tokens Engineer', 'Owns the tokens.'),
  posting('b', 'Frontend Engineer', 'You will build our component library.'),
];
const reader: PostingReader = {
  read: vi.fn(async () => ({ postings: postings.map((p) => ({ ...p })), sources: [] })),
};

afterEach(() => {
  cleanup();
  replaceProfiles([]);
  localStorage.clear();
  rule.current = null;
});

describe('useFeed: a changed inclusion rule', () => {
  it('reads again in full, so a posting let in by its description shows', async () => {
    rule.current = { terms: ['tokens'], inTitle: true, inText: false };
    saveProfile({ titles: ['Design Systems Engineer'] });
    const { result } = renderHook(() => useFeed(reader));
    await waitFor(() => expect(result.current.view?.rows.map((r) => r.id)).toEqual(['a']));

    rule.current = { terms: ['tokens', 'component library'], inTitle: true, inText: true };
    act(() => void saveProfile({ titles: ['Design Systems Engineer'], label: 'Wider' }));
    await waitFor(() =>
      expect(result.current.view?.rows.map((r) => r.id).sort()).toEqual(['a', 'b']),
    );
    console.log(
      'DBG',
      vi.mocked(reader.read).mock.calls.length,
      JSON.stringify(result.current.view?.hidden),
      JSON.stringify(result.current.profile.include),
    );
    const calls = vi.mocked(reader.read).mock.calls;
    // The second read asked for everything again, not only what was added (nothing was).
    expect(calls[calls.length - 1][0].terms).toEqual(calls[0][0].terms);
    expect(calls[calls.length - 1][0].boardUrls).toEqual(calls[0][0].boardUrls);
  });
});
