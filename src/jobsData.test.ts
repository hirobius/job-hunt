import { describe, expect, it } from 'vitest';
import { entryLevelize, BOARDS, boardsFor, SearchLoc } from './jobsData';

describe('entryLevelize', () => {
  it('returns empty/falsy string unchanged', () => {
    expect(entryLevelize('')).toBe('');
  });

  it('returns unhandled URLs unchanged', () => {
    const url = 'https://example.com/jobs?q=welder';
    expect(entryLevelize(url)).toBe(url);
  });

  describe('Indeed', () => {
    it('adds sc parameter when q is present and sc is absent', () => {
      const input = 'https://www.indeed.com/jobs?q=welder&l=Spokane%2C%20WA';
      const expected =
        'https://www.indeed.com/jobs?q=welder&l=Spokane%2C%20WA&sc=0kf%3Aexplvl(ENTRY_LEVEL)%3B';
      expect(entryLevelize(input)).toBe(expected);
    });

    it('does not add sc parameter when q is absent', () => {
      const input = 'https://www.indeed.com/jobs?l=Spokane%2C%20WA';
      expect(entryLevelize(input)).toBe(input);
    });

    it('does not add sc parameter when sc is already present', () => {
      const input = 'https://www.indeed.com/jobs?q=welder&sc=0kf%3Aexplvl(ENTRY_LEVEL)%3B';
      expect(entryLevelize(input)).toBe(input);
    });

    it('is idempotent for Indeed URLs', () => {
      const input = 'https://www.indeed.com/jobs?q=welder';
      const once = entryLevelize(input);
      const twice = entryLevelize(once);
      expect(twice).toBe(once);
    });
  });

  describe('LinkedIn', () => {
    it('adds f_E=2%2C3 using & when query params exist', () => {
      const input = 'https://www.linkedin.com/jobs/search/?keywords=welder';
      const expected = 'https://www.linkedin.com/jobs/search/?keywords=welder&f_E=2%2C3';
      expect(entryLevelize(input)).toBe(expected);
    });

    it('adds f_E=2%2C3 using ? when no query params exist', () => {
      const input = 'https://www.linkedin.com/jobs/search';
      const expected = 'https://www.linkedin.com/jobs/search?f_E=2%2C3';
      expect(entryLevelize(input)).toBe(expected);
    });

    it('does not add f_E when already present', () => {
      const input = 'https://www.linkedin.com/jobs/search/?keywords=welder&f_E=2';
      expect(entryLevelize(input)).toBe(input);
    });

    it('is idempotent for LinkedIn URLs', () => {
      const input = 'https://www.linkedin.com/jobs/search/?keywords=welder';
      const once = entryLevelize(input);
      const twice = entryLevelize(once);
      expect(twice).toBe(once);
    });
  });

  describe('ZipRecruiter', () => {
    it('appends entry level to search param when present', () => {
      const input = 'https://www.ziprecruiter.com/jobs-search?search=welder&location=Spokane';
      const expected =
        'https://www.ziprecruiter.com/jobs-search?search=welder%20entry%20level&location=Spokane';
      expect(entryLevelize(input)).toBe(expected);
    });

    it('adds search=entry%20level when search param is missing', () => {
      const input = 'https://www.ziprecruiter.com/candidate/search?location=Spokane';
      const expected =
        'https://www.ziprecruiter.com/candidate/search?location=Spokane&search=entry%20level';
      expect(entryLevelize(input)).toBe(expected);
    });

    it('leaves url unchanged if search param already contains entry', () => {
      const input = 'https://www.ziprecruiter.com/jobs-search?search=welder%20entry%20level';
      expect(entryLevelize(input)).toBe(input);
    });

    it('is idempotent for ZipRecruiter URLs', () => {
      const input = 'https://www.ziprecruiter.com/jobs-search?search=welder';
      const once = entryLevelize(input);
      const twice = entryLevelize(once);
      expect(twice).toBe(once);
    });
  });

  describe('Dice', () => {
    it('appends entry level to q param when present', () => {
      const input = 'https://www.dice.com/jobs?q=welder';
      const expected = 'https://www.dice.com/jobs?q=welder%20entry%20level';
      expect(entryLevelize(input)).toBe(expected);
    });

    it('adds q=entry%20level when q param is missing', () => {
      const input = 'https://www.dice.com/jobs?location=Spokane';
      const expected = 'https://www.dice.com/jobs?location=Spokane&q=entry%20level';
      expect(entryLevelize(input)).toBe(expected);
    });

    it('leaves url unchanged if q param already contains entry', () => {
      const input = 'https://www.dice.com/jobs?q=welder%20entry%20level';
      expect(entryLevelize(input)).toBe(input);
    });

    it('is idempotent for Dice URLs', () => {
      const input = 'https://www.dice.com/jobs?q=welder';
      const once = entryLevelize(input);
      const twice = entryLevelize(once);
      expect(twice).toBe(once);
    });
  });

  describe('Google Jobs', () => {
    it('appends entry level to q param when ibp=htl is present', () => {
      const input = 'https://www.google.com/search?q=welder&ibp=htl;jobs';
      const expected = 'https://www.google.com/search?q=welder%20entry%20level&ibp=htl;jobs';
      expect(entryLevelize(input)).toBe(expected);
    });

    it('adds q=entry%20level when ibp=htl is present but q param is missing', () => {
      const input = 'https://www.google.com/search?ibp=htl;jobs';
      const expected = 'https://www.google.com/search?ibp=htl;jobs&q=entry%20level';
      expect(entryLevelize(input)).toBe(expected);
    });

    it('does not modify google search URLs that do not have ibp=htl', () => {
      const input = 'https://www.google.com/search?q=welder';
      expect(entryLevelize(input)).toBe(input);
    });

    it('leaves url unchanged if q param already contains entry', () => {
      const input = 'https://www.google.com/search?q=welder%20entry%20level&ibp=htl;jobs';
      expect(entryLevelize(input)).toBe(input);
    });

    it('is idempotent for Google Jobs URLs', () => {
      const input = 'https://www.google.com/search?q=welder&ibp=htl;jobs';
      const once = entryLevelize(input);
      const twice = entryLevelize(once);
      expect(twice).toBe(once);
    });
  });
});

describe('Remote Rocketship (a remote-only board, link only)', () => {
  const rr = BOARDS.find((b) => b.name === 'Remote Rocketship')!;

  it('is one of the big boards, named like the others', () => {
    expect(rr).toBeDefined();
    expect(rr.tag).toBe('Remote only');
  });

  it('searches its title filter with the first ticked title (one title per search there)', () => {
    expect(rr.build('"Product Designer"', { where: '', mode: 'remote' })).toBe(
      'https://www.remoterocketship.com/?sort=DateAdded&jobTitle=Product%20Designer',
    );
    expect(
      rr.build('("Design Engineer" OR "Product Designer")', { where: 'Spokane, WA', mode: 'any' }),
    ).toBe('https://www.remoterocketship.com/?sort=DateAdded&jobTitle=Design%20Engineer');
  });

  it('with no title, leaves the jobTitle param out (review, finding 5)', () => {
    for (const term of ['', '""', '  ', '("" OR "")']) {
      expect(rr.build(term, { where: '', mode: 'remote' })).toBe(
        'https://www.remoterocketship.com/?sort=DateAdded',
      );
    }
  });

  it('shows only where remote work is on the table: Remote or Any, not Hybrid or On-site', () => {
    expect(boardsFor('remote').some((b) => b.name === 'Remote Rocketship')).toBe(true);
    expect(boardsFor('any').some((b) => b.name === 'Remote Rocketship')).toBe(true);
    expect(boardsFor('hybrid').some((b) => b.name === 'Remote Rocketship')).toBe(false);
    expect(boardsFor('onsite').some((b) => b.name === 'Remote Rocketship')).toBe(false);
    expect(boardsFor('onsite').map((b) => b.name)).toContain('Indeed');
  });
});

describe('BOARDS builders', () => {
  const getBuilder = (name: string) => {
    const board = BOARDS.find((b) => b.name === name);
    if (!board) throw new Error(`Board ${name} not found`);
    return board.build;
  };

  const termWithSpecialChars = 'Sheet Metal, Fabricator';
  const whereWithSpecialChars = 'Spokane, WA';

  describe('Indeed builder', () => {
    const build = getBuilder('Indeed');

    it('handles any mode with location and encodes term and location', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'any' };
      expect(build(termWithSpecialChars, loc)).toBe(
        'https://www.indeed.com/jobs?q=Sheet%20Metal%2C%20Fabricator&l=Spokane%2C%20WA',
      );
    });

    it('handles remote mode by replacing location with Remote', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'remote' };
      expect(build(termWithSpecialChars, loc)).toBe(
        'https://www.indeed.com/jobs?q=Sheet%20Metal%2C%20Fabricator&l=Remote',
      );
    });

    it('handles blank where in any mode by omitting location param', () => {
      const loc: SearchLoc = { where: '   ', mode: 'any' };
      expect(build(termWithSpecialChars, loc)).toBe(
        'https://www.indeed.com/jobs?q=Sheet%20Metal%2C%20Fabricator',
      );
    });

    it('hybrid adds the keyword (#355), onsite sends the place only with where', () => {
      expect(build('Welder', { where: 'Spokane, WA', mode: 'hybrid' })).toBe(
        'https://www.indeed.com/jobs?q=Welder%20hybrid&l=Spokane%2C%20WA',
      );
      expect(build('Welder', { where: 'Spokane, WA', mode: 'onsite' })).toBe(
        'https://www.indeed.com/jobs?q=Welder&l=Spokane%2C%20WA',
      );
    });
  });

  describe('LinkedIn builder', () => {
    const build = getBuilder('LinkedIn');

    it('handles mode=any with location (no f_WT param)', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'any' };
      expect(build(termWithSpecialChars, loc)).toBe(
        'https://www.linkedin.com/jobs/search/?keywords=Sheet%20Metal%2C%20Fabricator&location=Spokane%2C%20WA',
      );
    });

    it('handles mode=onsite (f_WT=1)', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'onsite' };
      expect(build('Welder', loc)).toBe(
        'https://www.linkedin.com/jobs/search/?keywords=Welder&location=Spokane%2C%20WA&f_WT=1',
      );
    });

    it('handles mode=remote with specific location (f_WT=2)', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'remote' };
      expect(build('Welder', loc)).toBe(
        'https://www.linkedin.com/jobs/search/?keywords=Welder&location=Spokane%2C%20WA&f_WT=2',
      );
    });

    it('handles mode=remote with blank where using United States fallback (f_WT=2)', () => {
      const loc: SearchLoc = { where: '   ', mode: 'remote' };
      expect(build('Welder', loc)).toBe(
        'https://www.linkedin.com/jobs/search/?keywords=Welder&location=United%20States&f_WT=2',
      );
    });

    it('handles mode=hybrid (f_WT=3)', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'hybrid' };
      expect(build('Welder', loc)).toBe(
        'https://www.linkedin.com/jobs/search/?keywords=Welder&location=Spokane%2C%20WA&f_WT=3',
      );
    });

    it('handles blank where in mode=any by omitting location', () => {
      const loc: SearchLoc = { where: '', mode: 'any' };
      expect(build('Welder', loc)).toBe('https://www.linkedin.com/jobs/search/?keywords=Welder');
    });
  });

  describe('ZipRecruiter builder', () => {
    const build = getBuilder('ZipRecruiter');

    it('handles any mode with location and encodes term and location', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'any' };
      expect(build(termWithSpecialChars, loc)).toBe(
        'https://www.ziprecruiter.com/jobs-search?search=Sheet%20Metal%2C%20Fabricator&location=Spokane%2C%20WA',
      );
    });

    it('handles remote mode by replacing location with Remote', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'remote' };
      expect(build('Welder', loc)).toBe(
        'https://www.ziprecruiter.com/jobs-search?search=Welder&location=Remote',
      );
    });

    it('handles blank where in any mode by omitting location', () => {
      const loc: SearchLoc = { where: ' ', mode: 'any' };
      expect(build('Welder', loc)).toBe('https://www.ziprecruiter.com/jobs-search?search=Welder');
    });

    it('hybrid adds the keyword (#355), onsite sends the place only', () => {
      expect(build('Welder', { where: 'Spokane, WA', mode: 'hybrid' })).toBe(
        'https://www.ziprecruiter.com/jobs-search?search=Welder%20hybrid&location=Spokane%2C%20WA',
      );
      expect(build('Welder', { where: 'Spokane, WA', mode: 'onsite' })).toBe(
        'https://www.ziprecruiter.com/jobs-search?search=Welder&location=Spokane%2C%20WA',
      );
    });
  });

  describe('Google Jobs builder', () => {
    const build = getBuilder('Google Jobs');

    it('handles any mode with location (combines term and trimmed where into q)', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'any' };
      expect(build(termWithSpecialChars, loc)).toBe(
        'https://www.google.com/search?q=Sheet%20Metal%2C%20Fabricator%20Spokane%2C%20WA&ibp=htl;jobs',
      );
    });

    it('handles remote mode by appending remote to query', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'remote' };
      expect(build('Welder', loc)).toBe(
        'https://www.google.com/search?q=Welder%20remote&ibp=htl;jobs',
      );
    });

    it('handles blank where in any mode', () => {
      const loc: SearchLoc = { where: '  ', mode: 'any' };
      expect(build('Welder', loc)).toBe('https://www.google.com/search?q=Welder&ibp=htl;jobs');
    });

    it('hybrid adds the keyword (#355), onsite sends the place only', () => {
      expect(build('Welder', { where: 'Spokane, WA', mode: 'hybrid' })).toBe(
        'https://www.google.com/search?q=Welder%20hybrid%20Spokane%2C%20WA&ibp=htl;jobs',
      );
      expect(build('Welder', { where: 'Spokane, WA', mode: 'onsite' })).toBe(
        'https://www.google.com/search?q=Welder%20Spokane%2C%20WA&ibp=htl;jobs',
      );
    });
  });

  describe('Snagajob builder', () => {
    const build = getBuilder('Snagajob');

    it('handles any mode with location', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'any' };
      expect(build(termWithSpecialChars, loc)).toBe(
        'https://www.snagajob.com/search?q=Sheet%20Metal%2C%20Fabricator&w=Spokane%2C%20WA',
      );
    });

    it('handles remote mode by setting w=Remote', () => {
      const loc: SearchLoc = { where: whereWithSpecialChars, mode: 'remote' };
      expect(build('Welder', loc)).toBe('https://www.snagajob.com/search?q=Welder&w=Remote');
    });

    it('handles blank where in any mode by omitting w param', () => {
      const loc: SearchLoc = { where: '', mode: 'any' };
      expect(build('Welder', loc)).toBe('https://www.snagajob.com/search?q=Welder');
    });

    it('hybrid adds the keyword (#355), onsite sends the place only', () => {
      expect(build('Welder', { where: 'Spokane, WA', mode: 'hybrid' })).toBe(
        'https://www.snagajob.com/search?q=Welder%20hybrid&w=Spokane%2C%20WA',
      );
      expect(build('Welder', { where: 'Spokane, WA', mode: 'onsite' })).toBe(
        'https://www.snagajob.com/search?q=Welder&w=Spokane%2C%20WA',
      );
    });
  });
});
