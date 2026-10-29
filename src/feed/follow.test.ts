// Saving follows the company (#388): a board posting follows its board as a Source, with its own
// link's slug and host (Lever EU), and lifts a mute on that company; Undo puts it all back.
import { beforeEach, describe, expect, it } from 'vitest';
import { followPosting } from './follow';
import { muteCompany } from './decided';
import { getSources, replaceSources } from '../sources';

beforeEach(() => {
  localStorage.clear();
  replaceSources([]);
});

const keyOf = () => getSources().map((s) => [s.kind, s.ref, s.eu ?? false, s.muted ?? false]);

describe('followPosting', () => {
  it('follows the board from the posting’s own link: its slug’s case and Lever EU kept', () => {
    followPosting({
      id: 'lever:acmeco:1',
      company: 'AcmeCo',
      url: 'https://jobs.eu.lever.co/AcmeCo/1',
    });
    expect(keyOf()).toEqual([['lever', 'AcmeCo', true, false]]);
  });

  it('falls back to the id when the link is the company’s own site', () => {
    followPosting({ id: 'greenhouse:acme:9', company: 'Acme', url: 'https://acme.com/jobs/9' });
    expect(keyOf()).toEqual([['greenhouse', 'acme', false, false]]);
  });

  it('follows the company by name for a feed posting', () => {
    followPosting({
      id: 'hn:123',
      company: 'Orbit',
      url: 'https://news.ycombinator.com/item?id=1',
    });
    expect(keyOf()).toEqual([['company', 'orbit', false, false]]);
  });

  it('lifts a Not this company mute; Undo mutes it again and takes the board back', () => {
    muteCompany('Acme');
    const undo = followPosting({
      id: 'ashby:acme:1',
      company: 'Acme',
      url: 'https://jobs.ashbyhq.com/acme/1',
    });
    expect(keyOf()).toEqual([
      ['company', 'acme', false, false],
      ['ashby', 'acme', false, false],
    ]);
    undo();
    expect(keyOf()).toEqual([['company', 'acme', false, true]]);
  });
});
