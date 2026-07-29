import { describe, expect, it } from 'vitest';
import { computeFunnel } from './funnel';
import type { Job } from './types';

let n = 0;
const j = (o: Partial<Job>): Job => ({ url: `https://x.co/${n++}`, label: 'x', status: 'Saved', ...o });

describe('computeFunnel', () => {
  it('empty list → zeros and null median', () => {
    const f = computeFunnel([]);
    expect(f.total).toBe(0);
    expect(f.byVerdict).toEqual({ match: 0, stretch: 0, reach: 0 });
    expect(f.byMode).toEqual({ remote: 0, hybrid: 0, onsite: 0 });
    expect(f.medianApplicants).toBeNull();
  });

  it('counts verdicts and modes, ignoring unset', () => {
    const f = computeFunnel([
      j({ verdict: 'match', mode: 'remote' }),
      j({ verdict: 'match', mode: 'hybrid' }),
      j({ verdict: 'reach' }),
      j({ mode: 'remote' }),
      j({}),
    ]);
    expect(f.total).toBe(5);
    expect(f.byVerdict).toEqual({ match: 2, stretch: 0, reach: 1 });
    expect(f.byMode).toEqual({ remote: 2, hybrid: 1, onsite: 0 });
  });

  it('median applicants: odd count, only jobs with a count', () => {
    const f = computeFunnel([j({ applicants: 300 }), j({ applicants: 100 }), j({ applicants: 200 }), j({})]);
    expect(f.medianApplicants).toBe(200);
  });

  it('median applicants: even count averages the middle two', () => {
    const f = computeFunnel([j({ applicants: 100 }), j({ applicants: 300 })]);
    expect(f.medianApplicants).toBe(200);
  });
});
