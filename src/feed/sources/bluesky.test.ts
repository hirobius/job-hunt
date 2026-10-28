import { describe, expect, it } from 'vitest';
import { blueskySearchUrl, fetchBluesky, parseBlueskyPost } from './bluesky';

// Synthetic fixtures in the app.bsky.feed.searchPosts shape (no real accounts).
const post = (
  over: Record<string, unknown> = {},
  text = "We're hiring a Design Systems Engineer (remote) #hiring",
) => ({
  uri: 'at://did:plc:abc123/app.bsky.feed.post/3kxyz',
  cid: 'bafy',
  author: { did: 'did:plc:abc123', handle: 'acme.example.social', displayName: 'Acme' },
  record: { $type: 'app.bsky.feed.post', text, createdAt: '2026-10-20T10:00:00.000Z' },
  indexedAt: '2026-10-20T10:00:01.000Z',
  ...over,
});

describe('parseBlueskyPost', () => {
  it('turns an employer post into a posting that links to the post and names its author', () => {
    expect(parseBlueskyPost(post())).toEqual({
      id: 'bluesky:at://did:plc:abc123/app.bsky.feed.post/3kxyz',
      source: 'bluesky',
      title: "We're hiring a Design Systems Engineer (remote)",
      company: '',
      url: 'https://bsky.app/profile/acme.example.social/post/3kxyz',
      location: '',
      postedAt: '2026-10-20T10:00:00.000Z',
      text: "Posted on Bluesky by Acme @acme.example.social\nWe're hiring a Design Systems Engineer (remote) #hiring",
    });
  });
  it('drops seekers, non-hiring posts and malformed ones', () => {
    expect(
      parseBlueskyPost(post({}, 'Open to work in design systems #OpenToWork #hiring')),
    ).toBeNull();
    expect(parseBlueskyPost(post({}, 'Our design system docs are live'))).toBeNull();
    expect(parseBlueskyPost(post({ uri: 'javascript:alert(1)' }))).toBeNull();
    expect(parseBlueskyPost(null)).toBeNull();
  });
});

describe('fetchBluesky', () => {
  it('searches the quoted term with each hiring word and keeps a post once', async () => {
    const urls: string[] = [];
    const out = await fetchBluesky('design systems', async (u) => {
      urls.push(u);
      return { posts: [post()] };
    });
    expect(urls).toEqual([
      blueskySearchUrl('design systems', 'hiring'),
      blueskySearchUrl('design systems', 'job'),
    ]);
    expect(urls[0]).toBe(
      'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=design%20systems%20hiring&sort=latest&limit=50',
    );
    expect(out).toHaveLength(1);
  });
  it('keeps one query when the other fails, and fails only when both do', async () => {
    const one = await fetchBluesky('design systems', async (u) => {
      if (u.includes('job')) throw new Error('429');
      return { posts: [post()] };
    });
    expect(one).toHaveLength(1);
    await expect(
      fetchBluesky('design systems', async () => {
        throw new Error('403');
      }),
    ).rejects.toThrow('403');
  });
  it('makes no request for a blank term and tolerates a malformed body', async () => {
    expect(
      await fetchBluesky(' ', async () => {
        throw new Error('no');
      }),
    ).toEqual([]);
    expect(await fetchBluesky('x', async () => ({ posts: 'nope' }))).toEqual([]);
  });
});
