import { describe, expect, it } from 'vitest';
import { teamSearchFor } from './teamTopics';

describe('teamSearchFor — the Companies search follows the track', () => {
  it.each([
    [['Design Systems Engineer'], 'design-system'],
    [['design tokens', 'token architect'], 'design-system'],
    [['Staff Design Engineer'], 'design-system'],
    [['Design engineer'], 'design-system'],
    [['Senior UI design engineer', 'Front-end design technologist'], 'design-system'],
    // A design-systems title still wins in a track that also names other work.
    [['Design systems engineer', 'Mechanical design engineer'], 'design-system'],
    [['ServiceNow Developer', 'ITSM'], 'ServiceNow'],
  ])('%j → %s teams', (terms, noun) => {
    expect(teamSearchFor(terms)?.noun).toBe(noun);
  });

  it.each([
    [['sheet metal', 'welder', 'CNC machinist']],
    [['implementation consultant', 'onboarding specialist']],
    [['System Designer']], // "system design" is not "design system"
    // "Design engineer" is also a CAD title in fab shops and engineering firms (#215 review).
    [['Mechanical design engineer']],
    [['Hardware design engineer']],
    [['Sheet metal design engineer']],
    [['Design Engineer - Mechanical']],
    [['Lead design engineer, sheet metal']],
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
