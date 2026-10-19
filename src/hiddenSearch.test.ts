// The "hidden jobs" Google lane (Discover → ATS search): site-restricted Google searches straight
// into companies' hiring systems and into the boards that have no open API, so every posting
// Google has indexed there turns up, with far less competition than the big aggregators.
import { describe, expect, it } from 'vitest';
import { ATS, CONTRACT_CLAUSE, HIDDEN_BOARDS, atsSearchUrl, searchAllUrl } from './jobsData';

const q = (url: string) => new URL(url).searchParams.get('q') ?? '';

describe('hidden-jobs search', () => {
  it('covers the long tail of hiring systems, not just the big three', () => {
    const domains = ATS.map((a) => a.domain);
    for (const d of [
      'boards.greenhouse.io',
      'jobs.lever.co',
      'jobs.ashbyhq.com',
      'apply.workable.com',
      'recruitee.com',
      'teamtailor.com',
      'bamboohr.com',
      'ats.rippling.com',
      'pinpointhq.com',
      'breezy.hr',
      'jobs.gem.com',
      'app.dover.com',
      'jobs.jobvite.com',
    ])
      expect(domains).toContain(d);
  });

  it('reaches the freelance and remote boards that have no open API', () => {
    const domains = HIDDEN_BOARDS.map((b) => b.domain);
    for (const d of [
      'upwork.com',
      'contra.com',
      'wellfound.com',
      'workatastartup.com',
      'remoteok.com',
      'himalayas.app',
      'jobicy.com',
      'weworkremotely.com',
    ])
      expect(domains).toContain(d);
  });

  it('builds one query: site, quoted role, level, location, contract-only and recency', () => {
    const url = atsSearchUrl('site:jobs.lever.co', {
      role: 'design systems',
      entry: true,
      where: 'Seattle, WA',
      mode: 'any',
      recency: 'w',
      contract: true,
    });
    expect(q(url)).toBe(
      `site:jobs.lever.co "design systems" (entry OR junior OR associate) "Seattle, WA" ${CONTRACT_CLAUSE}`,
    );
    expect(new URL(url).searchParams.get('tbs')).toBe('qdr:w');
    expect(q(atsSearchUrl('site:x.com', { role: 'ux', where: 'Ignored', mode: 'remote' }))).toBe(
      'site:x.com "ux" remote',
    );
  });

  it('"Search all" stays under Google’s 32-word query limit', () => {
    const words = q(
      searchAllUrl(ATS, {
        role: 'design systems',
        entry: true,
        where: 'Seattle, WA',
        mode: 'any',
        contract: true,
      }),
    )
      .split(/\s+/)
      .filter(Boolean);
    expect(words.length).toBeLessThanOrEqual(32);
  });
});
