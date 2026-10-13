import { describe, expect, it } from 'vitest';
import { fetchHn, parseHnComment, pickHiringThreads } from './hn';

// Synthetic fixtures in the Algolia HN shape — no real posters' contact details.
const comment = (over: Record<string, unknown>) => ({
  objectID: '100',
  story_id: 1,
  parent_id: 1,
  created_at: '2026-10-02T10:00:00Z',
  comment_text: '',
  ...over,
});

describe('pickHiringThreads', () => {
  it('keeps only "Who is hiring?" threads, newest first, capped', () => {
    const listing = {
      hits: [
        {
          objectID: '3',
          title: 'Ask HN: Who is hiring? (September 2026)',
          created_at: '2026-09-01',
        },
        {
          objectID: '4',
          title: 'Ask HN: Who wants to be hired? (October 2026)',
          created_at: '2026-10-01',
        },
        { objectID: '5', title: 'Ask HN: Who is hiring? (October 2026)', created_at: '2026-10-01' },
        { objectID: '1', title: 'Ask HN: Who is hiring? (August 2026)', created_at: '2026-08-01' },
      ],
    };
    expect(pickHiringThreads(listing).map((t) => t.id)).toEqual(['5', '3']);
  });
  it('tolerates a malformed listing', () => {
    expect(pickHiringThreads(null)).toEqual([]);
    expect(pickHiringThreads({ hits: 'nope' })).toEqual([]);
  });
});

describe('parseHnComment', () => {
  it('parses the pipe-delimited first line', () => {
    const p = parseHnComment(
      comment({
        comment_text:
          'Acme Labs (<a href="https:&#x2F;&#x2F;acme.dev">https:&#x2F;&#x2F;acme.dev</a>) | Founding Design Engineer | San Francisco, CA | ONSITE | Full-time | $180k<p>Own our design system.',
      }),
    )!;
    expect(p).toMatchObject({
      id: 'hn:100',
      source: 'hn',
      company: 'Acme Labs',
      title: 'Founding Design Engineer',
      location: 'San Francisco, CA · ONSITE',
      mode: 'onsite',
      url: 'https://news.ycombinator.com/item?id=100',
      postedAt: '2026-10-02T10:00:00Z',
    });
    expect(p.text).toContain('Own our design system.');
  });

  it('falls back to the prose opener for company and first line for title', () => {
    const p = parseHnComment(
      comment({
        comment_text: 'Widgetco is hiring engineers to build a component library.<p>Remote ok.',
      }),
    )!;
    expect(p.company).toBe('Widgetco');
    expect(p.title).toBe('Widgetco is hiring engineers to build a component library.');
    expect(p.mode).toBeUndefined();
  });

  it('skips salary, visa, links and emails when looking for the role', () => {
    const p = parseHnComment(
      comment({
        comment_text:
          'Zed | $150k | VISA | jobs@zed.example | Staff Frontend Engineer | REMOTE (US)',
      }),
    )!;
    expect(p.title).toBe('Staff Frontend Engineer');
    expect(p.location).toBe('REMOTE (US)');
    expect(p.mode).toBe('remote');
  });

  it('reads the "Company: / Role: / Location:" line format', () => {
    const p = parseHnComment(
      comment({
        comment_text:
          'Company: Acme<p>Role: Design Systems Engineer (1099 CONTRACT)<p>Location: Remote (EU)<p>We need tokens.',
      }),
    )!;
    expect(p).toMatchObject({
      company: 'Acme',
      title: 'Design Systems Engineer (1099 CONTRACT)',
      location: 'Remote (EU)',
      mode: 'remote',
    });
  });

  it('leaves the company blank when a prose opener names none', () => {
    const p = parseHnComment(
      comment({ comment_text: "We're hiring design engineers at the IRS!<p>More." }),
    )!;
    expect(p.company).toBe('');
    expect(p.title).toBe("We're hiring design engineers at the IRS!");
  });

  it('says "Roles listed in post" when a pipe line names no role', () => {
    const p = parseHnComment(
      comment({
        comment_text:
          'Cardog | Cardog | Toronto, Ontario | ONSITE | Full-time | https://cardog.example',
      }),
    )!;
    expect(p.company).toBe('Cardog');
    expect(p.title).toBe('Roles listed in post');
    expect(p.location).toBe('Toronto, Ontario · ONSITE');
  });

  it.each([
    ['a reply', comment({ parent_id: 999, comment_text: 'Is this still open?' })],
    ['a deleted comment', comment({ comment_text: null })],
    ['a hit with no id', comment({ objectID: '', comment_text: 'x' })],
  ])('ignores %s', (_label, hit) => {
    expect(parseHnComment(hit)).toBeNull();
  });
});

describe('fetchHn', () => {
  it('reads the latest threads and searches each for the term', async () => {
    const calls: string[] = [];
    const fetchJson = async (url: string) => {
      calls.push(url);
      if (url.includes('search_by_date'))
        return {
          hits: [
            {
              objectID: '7',
              title: 'Ask HN: Who is hiring? (October 2026)',
              created_at: '2026-10-01',
            },
          ],
        };
      return {
        hits: [comment({ story_id: 7, parent_id: 7, comment_text: 'Acme | UI Engineer | Remote' })],
      };
    };
    const out = await fetchHn('design systems', fetchJson);
    expect(out).toHaveLength(1);
    expect(calls[1]).toContain('tags=comment,story_7');
    expect(calls[1]).toContain('query=design%20systems');
  });
});
