import { describe, expect, it } from 'vitest';
import { teamSearchFor } from './teamTopics';

describe('teamSearchFor — the Companies search follows the track', () => {
  it.each([
    [['Design Systems Engineer'], 'design-system'],
    [['design tokens', 'token architect'], 'design-system'],
    [['Staff Design Engineer'], 'design-system'],
    [['ServiceNow Developer', 'ITSM'], 'ServiceNow'],
  ])('%j → %s teams', (terms, noun) => {
    expect(teamSearchFor(terms)?.noun).toBe(noun);
  });

  it.each([
    [['sheet metal', 'welder', 'CNC machinist']],
    [['implementation consultant', 'onboarding specialist']],
    [['System Designer']], // "system design" is not "design system"
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
