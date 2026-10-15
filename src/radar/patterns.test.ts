import { describe, expect, it } from 'vitest';
import { demandPatterns } from './patterns';
import { parseEvidence } from './fitGap';
import type { Posting } from '../feed/types';

const p = (id: string, text: string): Posting => ({
  id,
  source: 'greenhouse',
  title: 'Design Engineer',
  company: 'Co',
  url: `https://boards.greenhouse.io/co/jobs/${id}`,
  location: 'Remote',
  text,
});

describe('demand patterns', () => {
  it('counts each ask across postings, split into covered and thin, most-asked first', () => {
    const r = demandPatterns(
      [
        p('1', 'Design tokens and Storybook'),
        p('2', 'Storybook, accessibility'),
        p('3', 'Storybook'),
      ],
      parseEvidence('Accessibility: axe gates'),
    );
    expect(r.total).toBe(3);
    expect(r.covered).toEqual([{ label: 'Accessibility', count: 1 }]);
    expect(r.thin).toEqual([
      { label: 'Storybook / visual regression', count: 3 },
      { label: 'Design tokens', count: 1 },
    ]);
  });
});
