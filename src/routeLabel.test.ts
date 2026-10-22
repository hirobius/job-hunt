// Return paths: a Back names the page it goes to ("← Senior UX Designer", "← Apply mode (2 of
// 3)", "← Companies"), read from the route it returns to.
import { describe, expect, it } from 'vitest';
import { parseHash } from './route';
import { routeLabel } from './routeLabel';
import { jobIdOf } from './store';
import type { Job } from './types';
import type { Document } from './documents';

const job = (n: number, extra: Partial<Job> = {}): Job => ({
  url: `https://acme.example/jobs/${n}`,
  label: `Designer ${n}`,
  status: 'Saved',
  company: 'Acme Metals',
  ...extra,
});
const jobs = [job(1), job(2), job(3, { status: 'Applied' }), job(4)];
const docs: Document[] = [
  {
    id: 'd1',
    kind: 'outreach',
    title: 'Intro note',
    base: true,
    createdAt: '2026-10-01T00:00:00Z',
    versions: [{ id: 'v1', text: 'Hi', savedAt: '2026-10-01T00:00:00Z' }],
  } as Document,
];
const label = (hash: string) => routeLabel(parseHash(hash), { jobs, docs });

describe('routeLabel', () => {
  it.each([
    ['#/queue', 'Pipeline'],
    ['#/discover', 'Companies'],
    ['#/discover/ats', 'Companies'],
    ['#/discover/live', 'Live postings'],
    ['#/discover/boards', 'Check a list'],
    ['#/copy-deck', 'Documents'],
    ['#/copy-deck/d1', 'Intro note'],
    ['#/copy-deck/new/outreach', 'New outreach message'],
    ['#/legal/privacy', 'Privacy policy'],
    ['#/legal/terms', 'Terms of use'],
    ['#/company/acme-metals', 'Acme Metals'],
  ])('%s reads as %s', (hash, want) => expect(label(hash)).toBe(want));

  it("names a job by its title, and Apply mode by the job's place in the queue", () => {
    expect(label(`#/queue/${jobIdOf(job(2).url)}?section=screening`)).toBe('Designer 2');
    // To apply: 4 (newest first), 2, 1; the applied job 3 is not in it.
    expect(label(`#/apply/${jobIdOf(job(2).url)}`)).toBe('Apply mode (2 of 3)');
  });

  it('falls back to a plain name for a page it cannot find', () => {
    expect(label('#/queue/nope')).toBe('Job');
    expect(label('#/apply/nope')).toBe('Apply mode');
    expect(label('#/company/nobody')).toBe('Company');
    expect(label('#/copy-deck/nope')).toBe('Document');
  });
});
