// PREVIEW ONLY (scratch branch, Adrian's demo decision): "Try a demo" on the sign-in screen opens
// Review with fictional design-systems postings. Nothing is read from a job board, nothing is
// saved to an account and nothing syncs. The flag lives for this tab only.
import { useSyncExternalStore } from 'react';
import type { FeedRow } from '../feed/feed';

const KEY = 'rjb_demo_preview';
const listeners = new Set<() => void>();

export function demoOn(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function startDemo(): void {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* a blocked store: the demo still opens for this render */
  }
  listeners.forEach((l) => l());
}

export function useDemo(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    demoOn,
    () => false,
  );
}

const DAY = 86_400_000;
const row = (
  i: number,
  title: string,
  company: string,
  location: string,
  days: number,
  text: string,
  pay?: [number, number],
): FeedRow => ({
  id: `demo:${i}`,
  source: 'greenhouse',
  title,
  company,
  url: `https://jobs.example.com/${company.toLowerCase().replace(/[^a-z]+/g, '-')}/${i}`,
  location,
  mode: 'remote',
  postedAt: new Date(Date.now() - days * DAY).toISOString(),
  text,
  ...(pay ? { salaryMin: pay[0], salaryMax: pay[1], currency: 'USD' } : {}),
  score: 1,
  hit: 'title',
  signals: [],
  snippet: text.slice(0, 200),
  titles: ['Design Systems Engineer'],
  fingerprint: `demo-${i}`,
  firstSeen: new Date().toISOString().slice(0, 10),
  isNew: days < 1,
  why: 'Design systems in the title',
  rank: 10 - i,
});

/** Fictional companies and roles: no real employer, no real person. */
export const DEMO_ROWS: FeedRow[] = [
  row(
    1,
    'Senior Design Systems Engineer',
    'Larkspur Analytics',
    'Remote (US)',
    0,
    'Own the component library and its tokens across web and mobile. Work with design to ship accessible, documented components, and help product teams adopt them.',
    [150000, 180000],
  ),
  row(
    2,
    'Design Systems Lead',
    'Bramble & Finch',
    'Remote (US, Canada)',
    1,
    'Lead a team of three that builds and runs our design system. Set the roadmap with design and engineering, measure adoption, and keep the system healthy.',
    [170000, 205000],
  ),
  row(
    3,
    'Design Engineer, Design Systems',
    'Cobalt Harbor',
    'Remote (Europe)',
    2,
    'Build React components from Figma, keep code and design in step with Code Connect, and write the docs that help teams use them.',
  ),
  row(
    4,
    'Technical Program Manager, Design Platform',
    'Quillwork',
    'Remote (US)',
    4,
    'Run the design platform program: plan releases of the design system, track adoption across product teams, and keep stakeholders aligned.',
    [160000, 190000],
  ),
];
