// Sign-in memory (2026-11-12): the Feed's kept read holds no description for a posting the
// inclusion check leaves out, and the view built from it is the same as from the full read.
import { describe, expect, it } from 'vitest';
import { slimRead } from './useFeed';
import { cutText, ownString } from './ownString';
import { passesInclude } from './include';
import type { FeedResult } from './fetchFeed';
import type { Posting } from './types';

const long = 'We build the component library and its tokens. '.repeat(500);
const posting = (id: string, title: string, text = long) =>
  ({
    id,
    title,
    text,
    company: 'Acme',
    url: `https://example.com/${id}`,
    location: 'Remote',
  }) as Posting;
const rule = { terms: ['design system'], inTitle: true, inText: false };

describe('slimRead', () => {
  const read: FeedResult = {
    postings: [posting('a', 'Design Systems Engineer'), posting('b', 'Backend Engineer')],
    sources: [],
  };

  it('drops the text of what the rule leaves out and keeps the rest whole', () => {
    const slim = slimRead(read, rule);
    expect(slim.postings[0].text).toBe(long);
    expect(slim.postings[1].text).toBe('');
    expect(slim.postings.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('never changes what passes the check', () => {
    const textRule = { terms: ['component library'], inTitle: true, inText: true };
    for (const r of [rule, textRule])
      for (const p of read.postings)
        expect(
          passesInclude(r, p.title, slimRead(read, r).postings.find((q) => q.id === p.id)!.text),
        ).toBe(passesInclude(r, p.title, p.text));
  });

  it('returns the read itself when nothing is left out', () => {
    const all = { postings: [read.postings[0]], sources: [] };
    expect(slimRead(all, rule)).toBe(all);
  });
});

describe('cutText', () => {
  it('cuts to the limit and keeps short text as it is', () => {
    expect(cutText(long, 1500)).toBe(long.slice(0, 1500));
    expect(cutText('short', 1500)).toBe('short');
    expect(ownString(long)).toBe(long);
  });
});
