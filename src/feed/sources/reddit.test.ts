import { describe, expect, it } from 'vitest';
import { fetchReddit, parseRedditPost, REDDIT_SUBS, redditSearchUrl } from './reddit';

// Synthetic fixtures in the Reddit listing shape (no real users).
const child = (over: Record<string, unknown> = {}) => ({
  kind: 't3',
  data: {
    id: 'abc1',
    title: '[Hiring] Design Systems Designer, contract, remote',
    selftext: 'Own our component library.',
    permalink: '/r/forhire/comments/abc1/hiring_design_systems_designer/',
    created_utc: 1792000000,
    author: 'acme_hr',
    subreddit: 'forhire',
    link_flair_text: 'Hiring',
    ...over,
  },
});

describe('parseRedditPost', () => {
  it('keeps a [Hiring] post, linked to its permalink, tag dropped from the title', () => {
    expect(parseRedditPost(child())).toEqual({
      id: 'reddit:abc1',
      source: 'reddit',
      title: 'Design Systems Designer, contract, remote',
      company: '',
      url: 'https://www.reddit.com/r/forhire/comments/abc1/hiring_design_systems_designer/',
      location: '',
      postedAt: new Date(1792000000 * 1000).toISOString(),
      text: 'Posted in r/forhire by u/acme_hr\nOwn our component library.',
    });
  });
  it('drops [For Hire] posts, non-hiring posts and odd permalinks', () => {
    expect(
      parseRedditPost(child({ title: '[For Hire] DS consultant', link_flair_text: 'For Hire' })),
    ).toBeNull();
    expect(
      parseRedditPost(child({ title: 'How do you version tokens?', link_flair_text: '' })),
    ).toBeNull();
    expect(parseRedditPost(child({ permalink: '//evil.example/x' }))).toBeNull();
  });
  it('keeps a post outside r/forhire that reads as hiring', () => {
    const p = parseRedditPost(
      child({
        title: "We're hiring a design systems lead",
        link_flair_text: '',
        subreddit: 'DesignSystems',
      }),
    );
    expect(p?.title).toBe("We're hiring a design systems lead");
  });
});

describe('fetchReddit', () => {
  it('searches each subreddit for the term on the given base (oauth.reddit.com server-side)', async () => {
    const urls: string[] = [];
    await fetchReddit(
      'design systems',
      async (u) => (urls.push(u), { data: { children: [child()] } }),
      'https://oauth.reddit.com',
    );
    expect(urls).toEqual(
      REDDIT_SUBS.map((s) => redditSearchUrl('https://oauth.reddit.com', s, 'design systems')),
    );
    expect(urls[0]).toBe(
      'https://oauth.reddit.com/r/DesignSystems/search.json?q=design%20systems&restrict_sr=1&sort=new&t=month&limit=50',
    );
  });
  it('reads the Data API host by default, never www.reddit.com', async () => {
    const urls: string[] = [];
    await fetchReddit('design systems', async (u) => (urls.push(u), { data: { children: [] } }));
    expect(urls.every((u) => u.startsWith('https://oauth.reddit.com/'))).toBe(true);
  });
});
