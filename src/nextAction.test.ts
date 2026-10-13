import { describe, expect, it } from 'vitest';
import { nextAction } from './nextAction';
import type { Job } from './types';

const NOW = new Date(2026, 9, 13, 12);
const day = (n: number) => {
  const d = new Date(2026, 9, 13 - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const job = (o: Partial<Job>): Job =>
  ({ url: 'https://x.co/1', label: 'x', status: 'Saved', ...o }) as Job;

describe('nextAction (v1 prototype primaryLabel)', () => {
  it('Saved → Mark applied', () => {
    expect(nextAction(job({ status: 'Saved' }), NOW)).toBe('apply');
  });
  it('Applied with a follow-up due → Log follow-up', () => {
    expect(nextAction(job({ status: 'Applied', applied: day(10) }), NOW)).toBe('followup');
  });
  it('Interviewing, nothing due → Add interview', () => {
    expect(nextAction(job({ status: 'Interviewing', applied: day(1) }), NOW)).toBe('interview');
  });
  it('Rejected or retired → Reopen', () => {
    expect(nextAction(job({ status: 'Rejected' }), NOW)).toBe('reopen');
    expect(nextAction(job({ status: 'Applied', archived: true }), NOW)).toBe('reopen');
  });
  it('Applied, follow-up not yet due → Log follow-up (the default next step)', () => {
    expect(nextAction(job({ status: 'Applied', applied: day(1) }), NOW)).toBe('followup');
  });
  it('Offer → Log follow-up', () => {
    expect(nextAction(job({ status: 'Offer', applied: day(1) }), NOW)).toBe('followup');
  });
});
