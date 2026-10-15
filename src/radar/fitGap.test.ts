import { describe, expect, it } from 'vitest';
import { asksIn, fitGap, parseEvidence, tierOf } from './fitGap';
import type { Posting } from '../feed/types';

const posting = (text: string, title = 'Design Engineer'): Posting => ({
  id: 'x',
  source: 'ashby',
  title,
  company: 'Acme',
  url: 'https://jobs.ashbyhq.com/acme/1',
  location: 'Remote',
  text,
});

describe('evidence profile', () => {
  it('parses one skill per line: "Skill: proof (link)", ignoring blanks', () => {
    expect(
      parseEvidence(`Design tokens: DTCG pipeline (https://example.com/tokens)

Accessibility: axe + contrast gates`),
    ).toEqual([
      { skill: 'Design tokens', proof: 'DTCG pipeline', url: 'https://example.com/tokens' },
      { skill: 'Accessibility', proof: 'axe + contrast gates' },
    ]);
  });
});

describe('asks', () => {
  it('finds the asks a posting names, by phrase, once each', () => {
    const asks = asksIn(
      posting(
        'Build design tokens and an accessible component library. WCAG AA. Storybook a plus.',
      ),
    );
    expect(asks.map((a) => a.id)).toEqual(['tokens', 'a11y', 'components', 'storybook']);
  });
});

describe('fit / gap', () => {
  const evidence = parseEvidence(`Design tokens: DTCG pipeline
Accessibility: axe gates
Component library: 53 components on npm`);

  it('splits asks into fit (with the proof) and gap', () => {
    const r = fitGap(
      posting('Design tokens, WCAG accessibility, a component library, and Storybook.'),
      evidence,
    );
    expect(r.fit.map((f) => [f.ask.label, f.proof])).toEqual([
      ['Design tokens', 'DTCG pipeline'],
      ['Accessibility', 'axe gates'],
      ['Component library', '53 components on npm'],
    ]);
    expect(r.gap.map((a) => a.label)).toEqual(['Storybook / visual regression']);
    expect(r.tier).toBe('strong');
  });

  it('a user skill that is not in the catalog still counts as an ask', () => {
    const r = fitGap(
      posting('Experience with Fumadocs required.'),
      parseEvidence('Fumadocs: docs site'),
    );
    expect(r.fit.map((f) => f.ask.label)).toEqual(['Fumadocs']);
  });

  it('tiers by how much of what the posting asks is covered', () => {
    expect(tierOf(4, 1)).toBe('strong');
    expect(tierOf(2, 2)).toBe('stretch');
    expect(tierOf(1, 3)).toBe('reach');
    expect(tierOf(0, 0)).toBe('reach');
    // A posting that asks for one thing you have is not yet a strong fit.
    expect(tierOf(1, 0)).toBe('stretch');
  });
});
