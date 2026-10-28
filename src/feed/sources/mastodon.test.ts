import { describe, expect, it } from 'vitest';
import { FetchError } from './http';
import { fetchMastodon, mastodonUrls, parseMastodonStatus } from './mastodon';

// Synthetic fixtures in the /api/v1/timelines/tag shape (no real accounts).
const status = (over: Record<string, unknown> = {}) => ({
  id: '1',
  uri: 'https://example.social/users/acme/statuses/1',
  url: 'https://example.social/@acme/1',
  created_at: '2026-10-21T09:00:00.000Z',
  content:
    '<p>We&#39;re hiring a Design Systems Lead, remote EU. <a href="https://acme.example/jobs">acme.example/jobs</a> <a class="mention hashtag" href="https://example.social/tags/hiring">#<span>hiring</span></a></p>',
  account: { acct: 'acme@example.social', display_name: 'Acme' },
  reblog: null,
  ...over,
});

describe('mastodonUrls', () => {
  it('reads the job tags and the term tag on both instances', () => {
    expect(mastodonUrls('design systems')).toEqual([
      'https://mastodon.social/api/v1/timelines/tag/hiring?any%5B%5D=jobs&any%5B%5D=getfedihired&limit=40',
      'https://mastodon.social/api/v1/timelines/tag/designsystems?any%5B%5D=designsystem&limit=40',
      'https://hachyderm.io/api/v1/timelines/tag/hiring?any%5B%5D=jobs&any%5B%5D=getfedihired&limit=40',
      'https://hachyderm.io/api/v1/timelines/tag/designsystems?any%5B%5D=designsystem&limit=40',
    ]);
  });
  it('skips the term tag for a long phrase', () => {
    expect(mastodonUrls('a b c d')).toHaveLength(2);
  });
});

describe('parseMastodonStatus', () => {
  it('keeps an employer post with its author and home-server link', () => {
    expect(parseMastodonStatus(status())).toMatchObject({
      id: 'mastodon:https://example.social/users/acme/statuses/1',
      source: 'mastodon',
      title: "We're hiring a Design Systems Lead, remote EU. acme.example/jobs",
      url: 'https://example.social/@acme/1',
      postedAt: '2026-10-21T09:00:00.000Z',
    });
    expect(parseMastodonStatus(status())!.text).toMatch(
      /^Posted on Mastodon by Acme @acme@example\.social\n/,
    );
  });
  it('reads a boost as its original, drops seekers and unsafe links', () => {
    expect(parseMastodonStatus({ reblog: status(), content: '' })?.url).toBe(
      'https://example.social/@acme/1',
    );
    expect(
      parseMastodonStatus(
        status({ content: '<p>#OpenToWork design systems, #hiring managers DM me</p>' }),
      ),
    ).toBeNull();
    expect(parseMastodonStatus(status({ url: 'javascript:x', uri: 'javascript:x' }))).toBeNull();
  });
});

describe('fetchMastodon', () => {
  it('keeps one copy of a post seen on both instances', async () => {
    const out = await fetchMastodon('design systems', async () => [status()]);
    expect(out).toHaveLength(1);
  });
  it('keeps the instances that answer and fails only when none does', async () => {
    const some = await fetchMastodon('design systems', async (u) => {
      if (u.startsWith('https://hachyderm.io')) throw new FetchError(401, u);
      return [status()];
    });
    expect(some).toHaveLength(1);
    await expect(
      fetchMastodon('design systems', async (u) => {
        throw new FetchError(422, u);
      }),
    ).rejects.toBeInstanceOf(FetchError);
  });
});
