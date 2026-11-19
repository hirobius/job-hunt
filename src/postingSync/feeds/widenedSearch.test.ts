// Adrian 2026-11-17: a new profile and the server search design engineer, UX engineer and design
// technologist roles beside design systems; contract and freelance roles are kept, never dropped;
// remote stays the default; Adzuna and Jooble run once their Supabase secrets are set.
import { describe, expect, it } from 'vitest';
import { NEW_PROFILE, NEW_PROFILE_TITLES, DESIGN_SYSTEMS_TITLES } from '../../searchDefaults';
import { designSystemsTrack } from '../track-config';
import { fitRejectReason, type NormalizedPosting } from '../score';
import { scoreForTrack } from '../scoreForTrack';
import { isDsRole } from './dsRole';
import { ADZUNA_ENV, ADZUNA_PHRASES, adzunaEmployment, parseAdzuna } from './adzuna';
import { JOOBLE_ENV, JOOBLE_PHRASES, joobleEmployment, parseJooble } from './jooble';
import { serverFeedOn, serverFeedsForRun, serverFeedsOff } from './serverFeeds';

const posting = (title: string, descriptionText = ''): NormalizedPosting => ({
  source: 'adzuna',
  sourceId: `adzuna:${title}`,
  company: 'Acme',
  url: 'https://example.com/job',
  title,
  descriptionText,
});
const verdict = (title: string, text = '') =>
  scoreForTrack(posting(title, text), designSystemsTrack).verdict;

describe('the default profile (searchDefaults.ts NEW_PROFILE)', () => {
  it('searches the design-system titles and the design engineering ones, remote only', () => {
    expect(NEW_PROFILE.titles).toEqual(NEW_PROFILE_TITLES);
    expect(NEW_PROFILE_TITLES).toEqual(expect.arrayContaining(DESIGN_SYSTEMS_TITLES));
    expect(NEW_PROFILE_TITLES).toEqual(
      expect.arrayContaining(['Design Engineer', 'UX Engineer', 'Design Technologist']),
    );
    expect(NEW_PROFILE).toMatchObject({ remoteOnly: true, mode: 'remote', location: '' });
  });
});

describe('design engineering roles reach the board, guarded', () => {
  it('keeps UX engineer, design technologist and UI design engineer titles', () => {
    for (const t of [
      'UX Engineer',
      'Senior UX Engineer',
      'Design Technologist',
      'Design Engineer, Web',
      'Senior Front-End Design Engineer',
    ]) {
      expect(isDsRole(t), t).toBe(true);
      expect(verdict(t), t).not.toBe('reject');
    }
  });

  it('still leaves out hardware, civil and exhibit design engineers', () => {
    for (const t of [
      'Senior Railway Yard Drainage Design Engineer',
      'Mechanical Design Engineer',
      'Exhibit Design Engineer',
    ]) {
      expect(isDsRole(t), t).toBe(false);
      expect(verdict(t), t).toBe('reject');
    }
  });
});

describe('contract and freelance roles are kept', () => {
  it('the scorer and the fit rule never drop a role for being contract or freelance', () => {
    for (const t of [
      'Design Systems Engineer (Contract)',
      'Freelance Design Systems Designer',
      'Contract UX Engineer',
      'Design Technologist - 6 month contract',
      'Part-time Design Systems Consultant',
    ]) {
      expect(fitRejectReason(posting(t)), t).toBeNull();
      expect(verdict(t, 'Contract role. Own our design system and tokens.'), t).not.toBe('reject');
    }
  });

  it('Adzuna and Jooble say a contract in the text, so the Contract signal sees it', () => {
    expect(adzunaEmployment({ contract_type: 'contract', contract_time: 'full_time' })).toBe(
      'Employment: Contract',
    );
    expect(adzunaEmployment({ contract_type: 'permanent', contract_time: 'part_time' })).toBe(
      'Employment: Part-time',
    );
    expect(adzunaEmployment({ contract_type: 'permanent', contract_time: 'full_time' })).toBe('');
    expect(joobleEmployment('Contract')).toBe('Employment: Contract');
    expect(joobleEmployment('Temporary')).toBe('Employment: Temporary');
    expect(joobleEmployment('Full-time')).toBe('');
    expect(joobleEmployment('')).toBe('');

    const [a] = parseAdzuna({
      results: [
        {
          id: '7',
          title: 'Design Systems Engineer',
          description: 'Own the design system.',
          redirect_url: 'https://www.adzuna.com/land/ad/7',
          contract_type: 'contract',
          location: { display_name: 'Remote' },
        },
      ],
    });
    expect(a.descriptionText).toBe('Employment: Contract\nOwn the design system.');
    const [j] = parseJooble({
      jobs: [
        {
          title: 'UX Engineer',
          location: 'Remote',
          snippet: 'Design system work.',
          type: 'Contract',
          link: 'https://jooble.org/desc/9',
        },
      ],
    });
    expect(j.descriptionText).toBe('Employment: Contract\nDesign system work.');
    expect(j.remote).toBe(true);
  });
});

describe('Adzuna and Jooble (keyed server feeds)', () => {
  it('search the design engineering phrases too', () => {
    expect(ADZUNA_PHRASES).toEqual(
      expect.arrayContaining(['design engineer', 'ux engineer', 'design technologist']),
    );
    expect(JOOBLE_PHRASES).toEqual(
      expect.arrayContaining(['"design engineer"', '"ux engineer"', '"design technologist"']),
    );
  });

  it('run on the morning run once their secrets are set, and are off with none', () => {
    const none = () => undefined;
    expect(serverFeedOn('adzuna', none)).toBe(false);
    expect(serverFeedOn('jooble', none)).toBe(false);
    expect(serverFeedsOff(none)).toMatchObject({
      adzuna: 'ADZUNA_APP_ID, ADZUNA_APP_KEY',
      jooble: 'JOOBLE_API_KEY',
    });
    const secrets: Record<string, string> = {
      ADZUNA_APP_ID: 'id',
      ADZUNA_APP_KEY: 'key',
      JOOBLE_API_KEY: 'key',
    };
    const env = (n: string) => secrets[n];
    expect(serverFeedsForRun(env, true)).toEqual(expect.arrayContaining(['adzuna', 'jooble']));
    // The 14:23 run spends no key budget.
    expect(serverFeedsForRun(env, false)).not.toContain('adzuna');
    expect(serverFeedsOff(env)).not.toHaveProperty('adzuna');
    expect([...ADZUNA_ENV, ...JOOBLE_ENV]).toEqual([
      'ADZUNA_APP_ID',
      'ADZUNA_APP_KEY',
      'JOOBLE_API_KEY',
    ]);
  });
});
