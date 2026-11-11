import { describe, expect, it } from 'vitest';
import { dockKeysFor, hasApplicationLink } from './dockKeys';
import type { Job } from './types';

// #540: one table, one row per state. Exactly one filled key whenever there is a next step.
const NOW = new Date(2026, 10, 11, 12);
const job = (p: Partial<Job>): Job => ({
  url: 'https://x.test/1',
  label: 'Designer',
  status: 'Saved',
  ...p,
});

describe('dockKeysFor', () => {
  it.each([
    ['to apply, has link', {}, { filled: 'openApplication', grey: 'markApplied', exit: 'notAFit' }],
    [
      'to apply, no link',
      { url: 'notes:designer' },
      { filled: 'markApplied', grey: 'addLink', exit: 'notAFit' },
    ],
    [
      'follow-up due',
      { status: 'Applied', applied: '2026-10-30' },
      { filled: 'copyFollowUp', grey: 'markFollowedUp', exit: 'closeOut' },
    ],
    ['interviewing', { status: 'Interviewing', applied: '2026-11-10' }, { filled: 'addInterview' }],
    ['no next step (offer)', { status: 'Offer', applied: '2026-11-10' }, null],
    ['set aside', { archived: true }, null],
  ] as const)('%s', (_name, patch, keys) => {
    expect(dockKeysFor(job(patch as Partial<Job>), NOW)).toEqual(keys);
  });

  it('a job with no link never offers Open application', () => {
    const k = dockKeysFor(job({ url: 'notes:designer' }), NOW)!;
    expect(Object.values(k)).not.toContain('openApplication');
    expect(hasApplicationLink(job({ url: 'notes:designer' }))).toBe(false);
  });
});
