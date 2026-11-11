import { describe, expect, it } from 'vitest';
import { applicationLink, dockKeys } from './dockKeys';
import type { Job } from './types';

// The dock's keys per job state (#535, #540): one table, one row per state, exactly one filled key
// in each state that has keys, and a job with no link never gets Open application.
const NOW = new Date(2026, 10, 11, 12);
const job = (patch: Partial<Job>): Job => ({
  url: 'https://acme.example/jobs/1',
  label: 'Design Systems Lead',
  status: 'Saved',
  ...patch,
});

const ROWS: { state: string; job: Job; keys: string[] }[] = [
  {
    state: 'to apply, has a link',
    job: job({}),
    keys: ['openApplication:primary', 'markApplied:secondary', 'notAFit:exit'],
  },
  {
    state: 'to apply, no link (a placeholder)',
    job: job({ url: 'notes:designer' }),
    keys: ['markApplied:primary', 'addLink:secondary', 'notAFit:exit'],
  },
  {
    state: 'to apply, a link no browser opens',
    job: job({ url: 'acme.example/jobs/1' }),
    keys: ['markApplied:primary', 'addLink:secondary', 'notAFit:exit'],
  },
  {
    state: 'follow-up due',
    job: job({ status: 'Applied', applied: '2026-10-30' }),
    keys: ['copyFollowUp:primary', 'markFollowedUp:secondary', 'closeOut:exit'],
  },
  {
    state: 'Interviewing, nothing due',
    job: job({ status: 'Interviewing', applied: '2026-11-10' }),
    keys: ['addInterview:primary'],
  },
  {
    state: 'applied, not yet due',
    job: job({ status: 'Applied', applied: '2026-11-10' }),
    keys: [],
  },
  { state: 'Offer', job: job({ status: 'Offer', applied: '2026-11-10' }), keys: [] },
  { state: 'set aside (Not a fit)', job: job({ archived: true }), keys: [] },
];

describe('dockKeys', () => {
  it.each(ROWS)('$state', ({ job: j, keys }) => {
    const got = dockKeys(j, NOW);
    expect(got.map((k) => `${k.id}:${k.rank}`)).toEqual(keys);
    if (got.length) expect(got.filter((k) => k.rank === 'primary')).toHaveLength(1);
    if (!applicationLink(j)) expect(got.map((k) => k.id)).not.toContain('openApplication');
  });

  it('a job with no link never offers Open application', () => {
    const j = job({ url: 'notes:designer' });
    expect(applicationLink(j)).toBeUndefined();
    expect(dockKeys(j, NOW).map((k) => k.id)).not.toContain('openApplication');
  });
});
