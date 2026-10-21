import { describe, expect, it } from 'vitest';
import { parseMeta, postedWindow, splitTileName } from './tileMeta';

describe('parseMeta', () => {
  it.each([
    [
      'Al / bronze casting · entry molder, will train · ~$20–26/hr · hr@travispattern.com · 509-466-3545',
      {
        chips: [
          ['pay', '~$20–26/hr'],
          ['contact', 'hr@travispattern.com'],
          ['contact', '509-466-3545'],
        ],
        phones: ['509-466-3545'],
        notes: ['Al / bronze casting', 'entry molder, will train'],
      },
    ],
    [
      'Spokane Valley contractor · $25–40/hr · hires apprentices on a rolling basis',
      {
        chips: [['pay', '$25–40/hr']],
        phones: [],
        notes: ['Spokane Valley contractor', 'hires apprentices on a rolling basis'],
      },
    ],
    [
      'Concrete masonry units · Spokane Valley · 509-534-0651',
      {
        chips: [
          ['place', 'Spokane Valley'],
          ['contact', '509-534-0651'],
        ],
        phones: ['509-534-0651'],
        notes: ['Concrete masonry units'],
      },
    ],
    [
      '2026 intake CLOSED · apply via Inland Empire Electrical · 509-534-0922',
      {
        chips: [['contact', '509-534-0922']],
        phones: ['509-534-0922'],
        notes: ['2026 intake CLOSED', 'apply via Inland Empire Electrical'],
      },
    ],
  ])('splits %s', (meta, want) => {
    const p = parseMeta(meta);
    expect(p.chips.map((c) => [c.kind, c.text])).toEqual(want.chips);
    expect(p.phones).toEqual(want.phones);
    expect(p.notes).toEqual(want.notes);
    expect(p.raw).toBe(meta);
  });

  it('collects every phone number, not just the first', () => {
    expect(parseMeta('Hall A 509-111-2222 · Hall B 509-333-4444').phones).toEqual([
      '509-111-2222',
      '509-333-4444',
    ]);
  });

  it('falls back to the raw string when nothing parses', () => {
    const p = parseMeta('ATS-friendly resume builder');
    expect(p.chips).toEqual([]);
    expect(p.notes).toEqual(['ATS-friendly resume builder']);
    expect(p.raw).toBe('ATS-friendly resume builder');
  });

  it('copes with an empty meta', () => {
    expect(parseMeta('')).toMatchObject({ chips: [], notes: [], phones: [], raw: '' });
  });
});

describe('postedWindow (rev-3 H Calendar fact)', () => {
  it.each([
    ['https://www.linkedin.com/jobs/search/?keywords=x&f_TPR=r86400', 'Past day'],
    ['https://www.linkedin.com/jobs/search/?keywords=x&f_TPR=r604800', 'Past week'],
    ['https://www.linkedin.com/jobs/search/?keywords=x&f_TPR=r2592000', 'Past month'],
    ['https://www.indeed.com/jobs?q=x&fromage=1', 'Past day'],
    ['https://www.indeed.com/jobs?q=x&fromage=3', 'Past 3 days'],
    ['https://www.indeed.com/jobs?q=x&fromage=7', 'Past week'],
    ['https://www.indeed.com/jobs?q=x&fromage=14', 'Past 14 days'],
    ['https://www.google.com/search?q=x&tbs=qdr:w', 'Past week'],
    ['https://www.google.com/search?q=x&tbs=qdr:m', 'Past month'],
    ['https://www.indeed.com/jobs?q=x', 'Any time'],
    ['not a url', 'Any time'],
  ])('%s → %s', (url, want) => expect(postedWindow(url)).toBe(want));
});

describe('splitTileName (rev-3 H)', () => {
  it('splits the source and strips a trailing place the facts row now carries', () => {
    expect(
      splitTileName('LinkedIn · Implementation Consultant (Remote)', 'https://linkedin.com'),
    ).toEqual({ source: 'LinkedIn', title: 'Implementation Consultant', place: 'Remote' });
    expect(splitTileName('Indeed · Implementation (Spokane)', 'https://indeed.com')).toEqual({
      source: 'Indeed',
      title: 'Implementation',
      place: 'Spokane',
    });
  });

  it('keeps a parenthetical that is not a place', () => {
    expect(
      splitTileName('Greenhouse · Implementation Consultant (hidden jobs)', 'https://g.co').title,
    ).toBe('Implementation Consultant (hidden jobs)');
  });

  it('uses the domain as the source of a bare name', () => {
    expect(splitTileName('Travis Pattern', 'https://www.travispattern.com/')).toEqual({
      source: 'travispattern.com',
      title: 'Travis Pattern',
    });
  });
});
