import { describe, expect, it } from 'vitest';
import {
  fetchHn,
  parseFreelancerComment,
  parseHnComment,
  pickFreelancerThreads,
  pickHiringThreads,
} from './hn';

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
        { objectID: '0', title: 'Ask HN: Who is hiring? (July 2026)', created_at: '2026-07-01' },
      ],
    };
    // The last three months; "Who wants to be hired?" (#4) is never read.
    expect(pickHiringThreads(listing).map((t) => t.id)).toEqual(['5', '3', '1']);
  });
  it("reads a month's busiest freelancer thread when it was posted twice", () => {
    const listing = {
      hits: [
        {
          objectID: '9',
          title: 'Ask HN: Freelancer? Seeking freelancer? (September 2026)',
          created_at: '2026-09-01T10:00',
          num_comments: 2,
        },
        {
          objectID: '8',
          title: 'Ask HN: Freelancer? Seeking freelancer? (September 2026)',
          created_at: '2026-09-01T09:00',
          num_comments: 24,
        },
        {
          objectID: '7',
          title: 'Ask HN: Freelancer? Seeking freelancer? (October 2026)',
          created_at: '2026-10-01',
          num_comments: 22,
        },
      ],
    };
    expect(pickFreelancerThreads(listing).map((t) => t.id)).toEqual(['7', '8']);
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
      location: 'San Francisco, CA',
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
    expect(p.location).toBe('Remote (US)');
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
    expect(p.location).toBe('Toronto, Ontario');
  });

  // The facts line never repeats the mode or shouts (no ALL CAPS, rev-3 polish).
  it.each([
    ['Acme | Designer | Remote (US) | REMOTE', 'Remote (US)'],
    ['Acme | Designer | REMOTE', 'Remote'],
    ['Acme | Designer | ONSITE', 'Onsite'],
    ['Acme | Designer | HYBRID | Austin, TX', 'Austin, TX'],
    ['Acme | Designer | SAN FRANCISCO, CA | ONSITE', 'San Francisco, CA'],
    ['Acme | Designer | NYC | On-site', 'NYC'],
    ['Acme | Designer | REMOTE (US) | REMOTE', 'Remote (US)'],
  ])('location of "%s" is "%s"', (line, location) => {
    expect(parseHnComment(comment({ comment_text: line }))!.location).toBe(location);
  });

  // Implementation-consulting and support tracks post these; they are roles, not "Roles listed".
  it.each([
    'Senior Implementation Consultant',
    'Solutions Consultant',
    'Onboarding Specialist',
    'Customer Success Manager',
    'Data Analyst',
    'Technical Support',
  ])('reads "%s" as the title', (role) => {
    const p = parseHnComment(comment({ comment_text: `Acme | ${role} | Remote | Full-time` }))!;
    expect(p.title).toBe(role);
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
        hits: [
          comment({
            story_id: 7,
            parent_id: 7,
            comment_text: 'Acme | UI Engineer | Remote<p>Own our design systems.',
          }),
          // Algolia's word match: "design" and "system" apart, not the phrase. Dropped.
          comment({
            objectID: '101',
            story_id: 7,
            parent_id: 7,
            comment_text: 'Beta | Engineer | Remote<p>We design the billing system.',
          }),
        ],
      };
    };
    const out = await fetchHn('design systems', fetchJson);
    expect(out.map((p) => p.id)).toEqual(['hn:100']);
    expect(calls[0]).toContain('hitsPerPage=15');
    const search = calls.find((c) => c.includes('tags=comment'))!;
    expect(search).toContain('tags=comment,story_7');
    expect(search).toContain('query=design%20systems');
  });
});

describe('Freelancer? Seeking freelancer? thread', () => {
  const listing = {
    hits: [
      { objectID: '5', title: 'Ask HN: Who is hiring? (October 2026)', created_at: '2026-10-01' },
      {
        objectID: '6',
        title: 'Ask HN: Freelancer? Seeking freelancer? (October 2026)',
        created_at: '2026-10-01',
      },
      {
        objectID: '2',
        title: 'Ask HN: Freelancer? Seeking freelancer? (September 2026)',
        created_at: '2026-09-01',
      },
      {
        objectID: '1',
        title: 'Ask HN: Freelancer? Seeking freelancer? (August 2026)',
        created_at: '2026-08-01',
      },
    ],
  };

  it('picks the newest freelancer threads, never a hiring thread', () => {
    expect(pickFreelancerThreads(listing).map((t) => t.id)).toEqual(['6', '2']);
    expect(pickHiringThreads(listing).map((t) => t.id)).toEqual(['5']);
    expect(pickFreelancerThreads(null)).toEqual([]);
  });

  it('keeps SEEKING FREELANCER posts, marks them freelance, and parses the rest of the line', () => {
    const p = parseFreelancerComment(
      comment({
        comment_text:
          'SEEKING FREELANCER | Acme Labs | Design Systems Engineer | Remote (US)<p>Need tokens in Figma and code.',
      }),
    )!;
    expect(p).toMatchObject({
      id: 'hn:100',
      source: 'hn',
      company: 'Acme Labs',
      title: 'Design Systems Engineer',
      mode: 'remote',
    });
    expect(p.text.split('\n')[0]).toBe('Job type: Freelance (HN freelancer thread)');
    expect(p.text).toContain('Need tokens in Figma and code.');
  });

  it('skips SEEKING WORK posts, in any case, and posts that are neither', () => {
    expect(
      parseFreelancerComment(
        comment({ comment_text: 'SEEKING WORK | Berlin | Remote | Design systems' }),
      ),
    ).toBeNull();
    expect(
      parseFreelancerComment(comment({ comment_text: 'seeking work: tokens, Figma' })),
    ).toBeNull();
    expect(parseFreelancerComment(comment({ comment_text: 'Great thread, thanks' }))).toBeNull();
    expect(
      parseFreelancerComment(comment({ parent_id: 9, comment_text: 'SEEKING FREELANCER | A' })),
    ).toBeNull();
  });

  it('a freelance post gets the contract signal', async () => {
    const { detectSignals } = await import('../match');
    const p = parseFreelancerComment(
      comment({ comment_text: 'SEEKING FREELANCER | Acme | UI Engineer' }),
    )!;
    expect(detectSignals(`${p.title}\n${p.text}`).map((s) => s.id)).toContain('contract');
  });

  it('fetchHn reads both thread kinds from one listing and keeps only the seeking-freelancer side', async () => {
    const calls: string[] = [];
    const fetchJson = async (url: string) => {
      calls.push(url);
      if (url.includes('search_by_date')) return listing;
      if (url.includes('story_6'))
        return {
          hits: [
            comment({
              objectID: '61',
              story_id: 6,
              parent_id: 6,
              comment_text: 'SEEKING FREELANCER | Zed | Design Systems Lead | Remote',
            }),
            comment({
              objectID: '62',
              story_id: 6,
              parent_id: 6,
              comment_text: 'SEEKING WORK | Remote | Design systems',
            }),
          ],
        };
      if (url.includes('story_2')) return { hits: [] };
      return {
        hits: [
          comment({
            objectID: '51',
            story_id: 5,
            parent_id: 5,
            comment_text: 'Acme | Design Systems Engineer | Remote',
          }),
        ],
      };
    };
    const out = await fetchHn('design systems', fetchJson);
    expect(out.map((p) => p.id).sort()).toEqual(['hn:51', 'hn:61']);
    // One listing for each kind: the freelancer thread is no longer posted by whoishiring.
    expect(calls.filter((c) => c.includes('search_by_date'))).toHaveLength(2);
    expect(calls.some((c) => c.includes('restrictSearchableAttributes=title'))).toBe(true);
    expect(calls.some((c) => c.includes('story_6'))).toBe(true);
  });

  it('keeps the hiring threads when the freelancer search or its thread fails', async () => {
    const hiring = {
      hits: [
        comment({
          objectID: '51',
          story_id: 5,
          parent_id: 5,
          comment_text: 'Acme | Design Systems Engineer | Remote',
        }),
      ],
    };
    const failSearch = async (url: string) => {
      if (url.includes('restrictSearchableAttributes')) throw new Error('down');
      if (url.includes('search_by_date')) return listing;
      return hiring;
    };
    expect((await fetchHn('design systems', failSearch)).map((p) => p.id)).toEqual(['hn:51']);
    const failThread = async (url: string) => {
      if (url.includes('search_by_date')) return listing;
      if (url.includes('story_6') || url.includes('story_2')) throw new Error('down');
      return hiring;
    };
    expect((await fetchHn('design systems', failThread)).map((p) => p.id)).toEqual(['hn:51']);
    // The hiring listing failing is still the source's failure.
    await expect(
      fetchHn('design systems', async () => {
        throw new Error('down');
      }),
    ).rejects.toThrow('down');
  });
});
