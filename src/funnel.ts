// Pipeline-shape aggregation (issue #60 §funnel; from the deck's "applicants — the metric no report
// could give you"). Pure + DOM-free → table-driven tests. Fed the currently-shown Job list so the
// funnel reflects whatever filter/search is active.
import type { Job, JobMode, Verdict } from './types';

export interface FunnelStats {
  total: number;
  byVerdict: Record<Verdict, number>;
  byMode: Record<JobMode, number>;
  /** Median across only the jobs that have an applicant count; null if none do. */
  medianApplicants: number | null;
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeFunnel(jobs: Job[]): FunnelStats {
  const byVerdict: Record<Verdict, number> = { match: 0, stretch: 0, reach: 0 };
  const byMode: Record<JobMode, number> = { remote: 0, hybrid: 0, onsite: 0 };
  const applicants: number[] = [];
  for (const j of jobs) {
    if (j.verdict) byVerdict[j.verdict] += 1;
    if (j.mode) byMode[j.mode] += 1;
    if (typeof j.applicants === 'number' && isFinite(j.applicants)) applicants.push(j.applicants);
  }
  return { total: jobs.length, byVerdict, byMode, medianApplicants: median(applicants) };
}
