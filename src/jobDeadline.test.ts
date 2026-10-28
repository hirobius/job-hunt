import { describe, expect, it } from 'vitest';
import { followUpDate } from './jobEvents';
import { sanitizeJobs } from './store';
import type { Job } from './types';

const NOW = new Date(2026, 9, 27);
const base: Job = { url: 'https://sam.gov/opp/a/view', label: 'Ductwork', status: 'Saved' };

describe('a solicitation’s response deadline (#275)', () => {
  it('is the follow-up date while the job is saved', () => {
    expect(followUpDate({ ...base, deadline: '2026-11-05' }, NOW)).toBe('2026-11-05');
    expect(followUpDate(base, NOW)).toBeNull();
  });

  it('gives way to the follow-up clock once applied, and to nothing when set aside', () => {
    const applied = {
      ...base,
      status: 'Applied' as const,
      applied: '2026-10-20',
      deadline: '2026-11-05',
    };
    expect(followUpDate(applied, NOW)).toBe('2026-10-27');
    expect(followUpDate({ ...base, deadline: '2026-11-05', archived: true }, NOW)).toBeNull();
  });

  it('syncs as a YYYY-MM-DD date only', () => {
    const [ok, bad] = sanitizeJobs([
      { ...base, deadline: '2026-11-05' },
      { ...base, url: 'https://sam.gov/opp/b/view', deadline: '5 Nov' },
    ]);
    expect(ok.deadline).toBe('2026-11-05');
    expect(bad).not.toHaveProperty('deadline');
  });
});
