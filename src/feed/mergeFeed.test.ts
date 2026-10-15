import { describe, expect, it } from 'vitest';
import { mergeRetry } from './mergeFeed';
import type { Posting } from './types';

const p = (id: string): Posting => ({
  id,
  source: 'hn',
  title: id,
  company: '',
  url: `https://x.test/${id}`,
  location: '',
  text: '',
});

describe('mergeRetry', () => {
  it('replaces the retried source and adds only its new postings', () => {
    const prev = {
      postings: [p('a')],
      sources: [
        { key: 'hn', label: 'Hacker News', fetched: 1 },
        { key: 'remotive', label: 'Remotive', fetched: 0, error: 'Remotive: timed out' },
      ],
    };
    const patch = {
      postings: [p('a'), p('b')],
      sources: [{ key: 'remotive', label: 'Remotive', fetched: 2 }],
    };
    expect(mergeRetry(prev, patch)).toEqual({
      postings: [p('a'), p('b')],
      sources: [
        { key: 'hn', label: 'Hacker News', fetched: 1 },
        { key: 'remotive', label: 'Remotive', fetched: 2 },
      ],
    });
  });

  it('keeps a source that fails again as failed', () => {
    const prev = { postings: [], sources: [{ key: 'r', label: 'R', fetched: 0, error: 'old' }] };
    const patch = { postings: [], sources: [{ key: 'r', label: 'R', fetched: 0, error: 'new' }] };
    expect(mergeRetry(prev, patch).sources[0].error).toBe('new');
  });
});
