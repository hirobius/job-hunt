import { describe, expect, it } from 'vitest';
import { teamSearchFor } from './teamTopics';

describe('teamSearchFor: the GitHub team search follows the terms', () => {
  it.each([
    [['Design Systems Engineer']],
    [['design tokens', 'token architect']],
    [['Staff Design Engineer']],
    [['Design engineer']],
    [['Senior UI design engineer', 'Front-end design technologist']],
    // A design-systems title still wins beside other work.
    [['Design systems engineer', 'Mechanical design engineer']],
  ])('%j → design-system teams', (terms) => {
    expect(teamSearchFor(terms)?.noun).toBe('design-system');
  });

  it.each([
    [['implementation specialist', 'onboarding specialist']],
    [['System Designer']], // "system design" is not "design system"
    // "Design engineer" is also a CAD title in engineering firms (#215 review).
    [['Mechanical design engineer']],
    [['Hardware design engineer']],
    [['Design Engineer - Mechanical']],
    [['Tool design engineer']],
    [['Design engineer', 'SolidWorks']],
    [['Design engineer', 'CAD drafter']],
    [['Interior designer', 'Graphic designer']],
    [[]],
  ])('%j → no GitHub search', (terms) => {
    expect(teamSearchFor(terms)).toBeNull();
  });

  it('searches the design-system topics narrowest first', () => {
    expect(teamSearchFor(['design systems'])?.queries).toEqual([
      ['design-system', 'design-tokens'],
      ['design-system'],
    ]);
  });
});
