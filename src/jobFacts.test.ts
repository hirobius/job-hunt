import { describe, expect, it } from 'vitest';
import { jobFacts } from './jobFacts';
import type { Job } from './types';

const base: Job = { url: 'https://acme.example/jobs/7', label: 'Design Engineer' } as Job;
const NOW = new Date('2026-10-20T12:00:00');

describe('jobFacts', () => {
  it('lists only what the job has, in a fixed order', () => {
    expect(
      jobFacts({ ...base, salary: '$80k', company: 'Acme', location: 'Spokane' }, NOW).map(
        (f) => f.term,
      ),
    ).toEqual(['Company', 'Location', 'Pay', 'Source']);
  });
  it('names the source host', () => {
    expect(jobFacts(base, NOW)).toEqual([{ term: 'Source', description: 'acme.example' }]);
  });
  it('says when it was applied and that a follow-up is due', () => {
    const f = jobFacts({ ...base, status: 'Applied', applied: '2026-10-10' }, NOW);
    expect(f).toContainEqual({ term: 'Applied', description: '10d ago' });
    expect(f).toContainEqual({ term: 'Follow-up', description: 'Due now' });
  });
  it('drops the follow-up clock on a retired job', () => {
    const f = jobFacts({ ...base, status: 'Applied', applied: '2026-10-10', archived: true }, NOW);
    expect(f.map((x) => x.term)).not.toContain('Follow-up');
  });
});
