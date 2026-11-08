// Companies whose careers site is an ATS the browser can't read (Workday, SuccessFactors, Taleo:
// no public CORS API; jobsData.ts only links them through a Google search). The auto-scan never
// probes these leads: the probe would ask every board kind for nothing. Scan details lists them as
// "unsupported board" instead (orchestrator, 2026-11-08: discovery noise).
//
// Hand-kept, by company name (companyKey), only where the company's own careers site is plainly on
// one of these. Unverified live from the build container (the hosts are refused there): take a
// name off when its board turns out to be one we read.
import { companyKey } from './decided';

export type UnsupportedAts = 'Workday' | 'SuccessFactors' | 'Taleo';

const LIST: [string, UnsupportedAts][] = [
  ['Workday', 'Workday'],
  ['Salesforce', 'Workday'],
  ['Red Hat', 'Workday'],
  ['VMware', 'Workday'],
  ['HP enterprise', 'Workday'],
  ['CA Technologies', 'Workday'],
  ['GE Digital', 'Workday'],
];

const BY_KEY = new Map(LIST.map(([name, ats]) => [companyKey(name), ats]));

/** The unreadable ATS a company is known to use, else null. */
export function unsupportedAtsOf(name: string): UnsupportedAts | null {
  return BY_KEY.get(companyKey(name)) ?? null;
}
