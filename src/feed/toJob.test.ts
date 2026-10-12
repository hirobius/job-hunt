import { describe, expect, it } from 'vitest';
import { jobFieldsFor } from './toJob';
import { HN_NO_ROLE } from './sources/hn';
import type { RankedPosting } from './types';

const ranked = (over: Partial<RankedPosting>): RankedPosting => ({
  id: 'ashby:acme:1',
  source: 'ashby',
  title: 'Design Systems Lead',
  company: 'Acme',
  url: 'https://jobs.ashbyhq.com/acme/1',
  location: 'New York, NY',
  mode: 'hybrid',
  text: '',
  score: 10,
  hit: 'title',
  signals: [],
  snippet: '',
  ...over,
});

describe('jobFieldsFor', () => {
  it.each([
    [
      'a board posting keeps its title, company, place and mode',
      ranked({}),
      {
        label: 'Design Systems Lead',
        company: 'Acme',
        location: 'New York, NY',
        mode: 'hybrid',
        note: 'Found in Live postings · Ashby · “design systems”',
      },
    ],
    [
      'signals ride along in the note so the Tracker keeps why it was saved',
      ranked({
        signals: [
          { id: 'contract', label: 'Contract-friendly', evidence: '1099' },
          { id: 'founding', label: 'Founding / first hire', evidence: 'founding engineer' },
        ],
      }),
      {
        note: 'Found in Live postings · Ashby · “design systems” · Contract-friendly, Founding / first hire',
      },
    ],
    [
      'an HN post with no parsed role is labelled by its company',
      ranked({ source: 'hn', title: HN_NO_ROLE, company: 'Cardog', mode: undefined }),
      { label: 'Cardog: roles listed in post', mode: undefined },
    ],
    [
      'an HN post with neither role nor company still gets a readable label',
      ranked({ source: 'hn', title: HN_NO_ROLE, company: '' }),
      { label: 'Hacker News hiring post' },
    ],
  ])('%s', (_label, p, expected) => {
    expect(jobFieldsFor(p, 'design systems')).toMatchObject(expected);
  });
});
