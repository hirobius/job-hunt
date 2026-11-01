import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dsJobs, DSJOBS_FEED, parseDsJobs } from './designsystemsjobs';

// The first five items of the live feed, read 2026-10-28.
const LIVE = readFileSync('src/feed/sources/fixtures/designsystems-jobs.xml', 'utf8');

describe('parseDsJobs', () => {
  it('reads the live feed: role and company split, place and mode from the line', () => {
    const out = parseDsJobs(LIVE);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({
      id: 'dsjobs:https://designsystems.jobs/companies/pasiona/ai-platform-engineer-devex-design-systems',
      source: 'dsjobs',
      title: 'AI Platform Engineer – DevEx & Design Systems',
      company: 'Pasiona',
      url: 'https://designsystems.jobs/companies/pasiona/ai-platform-engineer-devex-design-systems',
      location: 'Spain',
      postedAt: '2026-10-27T20:25:00.000Z',
      text: 'Software Engineer · Full time · Spain',
    });
    expect(out[1]).toMatchObject({ company: 'WHOOP', mode: 'onsite', location: 'United States' });
    expect(out[4]).toMatchObject({
      title: 'Frontend Engineer - Design Systems',
      company: 'Mercury',
      mode: 'remote',
      location: 'United States, Canada',
    });
  });

  it('never takes a mode or a job type for the place', () => {
    const line = (d: string) =>
      parseDsJobs(
        `<item><title>X at Y</title><link>https://designsystems.jobs/x</link><description>${d}</description></item>`,
      )[0];
    expect(line('Design · Senior · Full time · On-site')).toMatchObject({
      location: '',
      mode: 'onsite',
    });
    expect(line('Design · Senior · Full time').location).toBe('');
    expect(line('Design · Contract · Hybrid · Germany')).toMatchObject({
      location: 'Germany',
      mode: 'hybrid',
    });
  });

  it('keeps a title with no company whole, and drops items with no web link', () => {
    const xml = `<item><title>Design Systems Lead</title><link>https://designsystems.jobs/x</link></item>
      <item><title>Bad at Co</title><link>javascript:alert(1)</link></item>`;
    const out = parseDsJobs(xml);
    expect(out.map((p) => [p.title, p.company])).toEqual([['Design Systems Lead', '']]);
  });

  it('reads one fixed URL', () => {
    expect(dsJobs.upstream()).toEqual([DSJOBS_FEED]);
    expect(dsJobs.search).toBeFalsy();
  });
});
