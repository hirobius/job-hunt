// The "hidden jobs" Google lane (Discover → ATS search): site-restricted Google searches straight
// into companies' hiring systems and into the boards that have no open API, so every posting
// Google has indexed there turns up, with far less competition than the big aggregators.
import { describe, expect, it } from 'vitest';
import {
  ATS,
  CONTRACT_CLAUSE,
  HIDDEN_BOARDS,
  atsSearchUrl,
  searchAllCount,
  searchAllUrl,
} from './jobsData';

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

  // Methods 5 and 6 (docs/specs/discovery-methods.md): design-systems community boards and the big
  // per-tenant systems. Every `site:` clause must be well formed; none of these hosts is verified.
  describe('community boards and big-company systems', () => {
    const HOST = '[a-z0-9][a-z0-9.-]*\\.[a-z]{2,}(?:/[A-Za-z0-9_/-]+)?';
    const SITE = `site:${HOST}`;
    const CLAUSE = new RegExp(`^\\(?${SITE}(?: OR ${SITE})*\\)?(?: inurl:[A-Za-z]+| jobs)?$`);

    it('has a well-formed site clause on every row that searches', () => {
      for (const row of [...ATS, ...HIDDEN_BOARDS].filter((r) => !r.href))
        expect(row.site, row.name).toMatch(CLAUSE);
    });

    it('adds the design-systems community boards', () => {
      const byName = (n: string) => HIDDEN_BOARDS.find((b) => b.name === n);
      expect(byName('Smashing Jobs')?.site).toBe('site:smashingmagazine.com/jobs');
      expect(byName('Design Systems Jobs')?.site).toBe('site:designsystems.com jobs');
      expect(byName('Into Design Systems')?.site).toBe('site:intodesignsystems.com');
      expect(byName('Dribbble Jobs')?.site).toBe('site:dribbble.com/jobs');
      expect(byName('Authentic Jobs')?.site).toBe('site:authenticjobs.com');
      expect(byName('Dynamite Jobs')?.site).toBe('site:dynamitejobs.com');
      // Remotive is a feed source and LinkedIn blocks Google, so neither is a row.
      expect(HIDDEN_BOARDS.map((b) => b.domain)).not.toContain('remotive.com');
      expect(HIDDEN_BOARDS.map((b) => b.domain)).not.toContain('linkedin.com');
    });

    it('gives the members-only Slack a plain link, not a site clause', () => {
      const slack = HIDDEN_BOARDS.find((b) => b.name === 'Join Design Systems Slack');
      expect(slack?.href).toMatch(/^https:\/\//);
      expect(slack?.site).toBe('');
      expect(searchAllUrl(HIDDEN_BOARDS, { role: 'x', where: '', mode: 'any' })).not.toContain(
        'Slack',
      );
    });

    it('adds the big-company systems as Google clauses only', () => {
      const clause = (n: string) => ATS.find((a) => a.name === n)?.site;
      expect(clause('Workday')).toBe('site:myworkdayjobs.com');
      expect(clause('SuccessFactors')).toBe(
        '(site:successfactors.com OR site:successfactors.eu) inurl:career',
      );
      expect(clause('Taleo')).toBe('site:taleo.net inurl:careersection');
      expect(clause('iCIMS')).toBe('site:icims.com inurl:jobs');
      expect(clause('Oracle Recruiting')).toBe('site:oraclecloud.com inurl:CandidateExperience');
      // Links only: nothing here is a fetch (the spec forbids calling Workday or SuccessFactors).
      expect(ATS.every((a) => !a.href)).toBe(true);
    });

    it('keeps Search all within 32 words and counts the rows it fits', () => {
      const o = { role: 'design systems', entry: true, where: 'Seattle, WA', mode: 'any' as const };
      for (const sites of [ATS, HIDDEN_BOARDS]) {
        const words = q(searchAllUrl(sites, { ...o, contract: true }))
          .split(/\s+/)
          .filter(Boolean);
        expect(words.length).toBeLessThanOrEqual(32);
        expect(searchAllCount(sites, o)).toBeGreaterThan(0);
      }
      // A row with several ORed hosts counts once.
      const multi = [ATS.find((a) => a.name === 'SuccessFactors')!];
      expect(searchAllCount(multi, o)).toBe(1);
    });
  });
});
