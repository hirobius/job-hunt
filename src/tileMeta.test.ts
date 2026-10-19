import { describe, expect, it } from 'vitest';
import { parseMeta } from './tileMeta';

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
