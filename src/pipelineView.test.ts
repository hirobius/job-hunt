import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW,
  FILTER_LABEL,
  VIEWS,
  VIEW_DESCRIPTION,
  filterCounts,
  getPipelineView,
  weekDateOf,
  resetPipelineView,
  setPipelineView,
  visibleJobs,
  type Filter,
} from './pipelineView';
import type { Job } from './types';
import { ymd } from './jobEvents';

const job = (url: string, extra: Partial<Job> = {}): Job => ({ url, label: url, ...extra }) as Job;
const saved = job('https://a.example/1', { label: 'Alpha welder', company: 'Acme' });
const applied = job('https://b.example/2', { label: 'Beta fitter', status: 'Applied' });
const pinned = job('https://c.example/3', { label: 'Gamma', status: 'Applied', priority: true });
const retired = job('https://d.example/4', { label: 'Delta', archived: true });
const all = [saved, applied, pinned, retired];

beforeEach(resetPipelineView);

describe('pipelineView', () => {
  it('starts on To apply, recently added, no search', () => {
    expect(getPipelineView()).toEqual(DEFAULT_VIEW);
    expect(DEFAULT_VIEW).toEqual({ filter: 'toApply', sort: 'recent', q: '' });
  });

  it.each([
    ['toApply', ['Alpha welder']],
    ['applied', ['Beta fitter', 'Gamma']],
    ['all', ['Alpha welder', 'Beta fitter', 'Delta', 'Gamma']],
  ] as const)('view %s', (filter, titles) => {
    expect(
      visibleJobs(all, { ...DEFAULT_VIEW, filter })
        .map((j) => j.label)
        .sort(),
    ).toEqual([...titles].sort());
  });

  it('search matches title, company and url, case-insensitively, and also notes', () => {
    const withNotes = job('https://e.example/5', { label: 'Epsilon', notes: 'ask about Forklift' });
    const v = { ...DEFAULT_VIEW, filter: 'all' as const };
    expect(visibleJobs([...all, withNotes], { ...v, q: 'ACME' }).map((j) => j.label)).toEqual([
      'Alpha welder',
    ]);
    expect(visibleJobs([...all, withNotes], { ...v, q: 'forklift' }).map((j) => j.label)).toEqual([
      'Epsilon',
    ]);
  });

  it('sort is applied: A to Z', () => {
    expect(
      visibleJobs(all, { filter: 'all', sort: 'az', q: '' })
        .filter((j) => !j.archived)
        .map((j) => j.label),
    ).toEqual(['Gamma', 'Alpha welder', 'Beta fitter']); // pinned floats first;
  });

  it('six named views, then All jobs, each with a label and a one-line description', () => {
    expect(VIEWS.map((v) => FILTER_LABEL[v])).toEqual([
      'To apply',
      'Follow up',
      'This week',
      'Interviewing',
      'Applied',
      'Recently closed',
      'All jobs',
    ]);
    for (const v of VIEWS) expect(VIEW_DESCRIPTION[v]).toMatch(/^[^\n]{10,80}$/);
  });

  it('counts every view', () => {
    expect(filterCounts(all)).toEqual({
      toApply: 1,
      followUp: 0,
      thisWeek: 0,
      interviewing: 0,
      applied: 2,
      closed: 0,
      all: 4,
    });
  });

  it('This week lists interviews and closing dates in the next 7 days, soonest first (#640)', () => {
    const now = new Date(2026, 10, 11);
    const day = (n: number) => ymd(new Date(2026, 10, 11 + n));
    const interview = job('https://w.example/1', {
      label: 'Interview Thursday',
      status: 'Interviewing',
      events: [{ id: 'e1', kind: 'interview', date: day(2) }],
    } as Partial<Job>);
    const closing = job('https://w.example/2', { label: 'Closes tomorrow', deadline: day(1) });
    const later = job('https://w.example/3', { label: 'Closes in 9 days', deadline: day(9) });
    const past = job('https://w.example/4', {
      label: 'Interview last week',
      status: 'Interviewing',
      events: [{ id: 'e2', kind: 'interview', date: day(-5) }],
    } as Partial<Job>);
    const plain = job('https://w.example/5', { label: 'Nothing dated' });
    const jobs = [plain, later, past, interview, closing];
    expect(
      visibleJobs(jobs, { ...DEFAULT_VIEW, filter: 'thisWeek' }, now).map((j) => j.label),
    ).toEqual(['Closes tomorrow', 'Interview Thursday']);
    expect(filterCounts(jobs, now).thisWeek).toBe(2);
    expect(weekDateOf(interview, now)).toBe(day(2));
    expect(weekDateOf(plain, now)).toBeNull();
  });

  it('Follow up lists jobs whose follow-up is due; Interviewing holds offers too', () => {
    const now = new Date(2026, 10, 11);
    const due = job('https://i.example/9', {
      label: 'Due',
      status: 'Applied',
      applied: '2026-11-01',
    });
    const fresh = job('https://j.example/10', {
      label: 'Fresh',
      status: 'Applied',
      applied: '2026-11-10',
    });
    const offer = job('https://k.example/11', { label: 'Offer', status: 'Offer' });
    const talks = job('https://l.example/12', { label: 'Talks', status: 'Interviewing' });
    const list = [due, fresh, offer, talks];
    const v = (filter: Filter) =>
      visibleJobs(list, { ...DEFAULT_VIEW, filter }, now)
        .map((j) => j.label)
        .sort();
    expect(v('followUp')).toEqual(['Due']);
    expect(v('interviewing')).toEqual(['Offer', 'Talks']);
    expect(filterCounts(list, now).followUp).toBe(1);
  });

  it('set merges into the shared state and reset restores the default', () => {
    setPipelineView({ filter: 'applied' });
    setPipelineView({ q: 'x' });
    expect(getPipelineView()).toEqual({ filter: 'applied', sort: 'recent', q: 'x' });
    resetPipelineView();
    expect(getPipelineView()).toEqual(DEFAULT_VIEW);
  });
});

describe('To apply order and Recently closed (#541, #602)', () => {
  const inDays = (n: number) => {
    const d = new Date();
    return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
  };
  const soon = job('https://e.example/5', { label: 'Soon', status: 'Saved', deadline: inDays(3) });
  const later = job('https://f.example/6', {
    label: 'Later',
    status: 'Saved',
    deadline: inDays(30),
  });
  const gone = job('https://g.example/7', {
    label: 'Gone',
    status: 'Applied',
    closedAt: '2026-10-20T00:00:00Z',
  });
  const past = job('https://h.example/8', { label: 'Past', status: 'Saved', deadline: inDays(-2) });
  const list = [...all, soon, later, gone, past];

  it('To apply sorts by closing date first, then newest, and leaves closed jobs out', () => {
    expect(visibleJobs(list, DEFAULT_VIEW).map((j) => j.label)).toEqual([
      'Soon',
      'Later',
      'Alpha welder',
    ]);
  });
  it('Recently closed lists jobs gone from their board or past their closing day', () => {
    expect(
      visibleJobs(list, { ...DEFAULT_VIEW, filter: 'closed' })
        .map((j) => j.label)
        .sort(),
    ).toEqual(['Gone', 'Past']);
    expect(filterCounts(list).closed).toBe(2);
    expect(FILTER_LABEL.closed).toBe('Recently closed');
  });
});

describe('Remote only (#614)', () => {
  const j = (over: Partial<Job>): Job => ({
    url: `https://x.example/${Math.random()}`,
    label: 'Designer',
    status: 'Saved',
    ...over,
  });
  it('reads the mode first, else the title and location, with real location strings', async () => {
    const { isRemoteJob } = await import('./pipelineView');
    expect(isRemoteJob(j({ mode: 'remote' }))).toBe(true);
    expect(isRemoteJob(j({ mode: 'onsite', location: 'Remote' }))).toBe(false);
    expect(
      isRemoteJob(
        j({
          location:
            'San Francisco, CA, New York, NY, Portland, OR, or Remote within Canada or United States',
        }),
      ),
    ).toBe(true);
    expect(isRemoteJob(j({ location: 'Hybrid or Remote (US)' }))).toBe(true);
    expect(isRemoteJob(j({ location: 'Remote - US' }))).toBe(true);
    expect(isRemoteJob(j({ label: 'Senior Designer (Remote)', location: '' }))).toBe(true);
    expect(isRemoteJob(j({ location: 'New York, NY' }))).toBe(false);
    expect(isRemoteJob(j({ location: 'Hybrid, London' }))).toBe(false);
    expect(isRemoteJob(j({}))).toBe(false);
  });

  it('a line that rules remote out is not remote (#624)', async () => {
    const { isRemoteJob } = await import('./pipelineView');
    for (const location of [
      'New York, NY (No remote)',
      'Austin, TX - Not remote',
      'Non-remote, Seattle, WA',
      'London, UK; remote not available',
    ])
      expect(isRemoteJob(j({ location })), location).toBe(false);
    expect(isRemoteJob(j({ location: 'Onsite or remote' }))).toBe(true);
    expect(isRemoteJob(j({ location: 'Hybrid - Remote' }))).toBe(true);
  });

  it('chip counts, the list and the closed pool all follow Remote only, on every view', async () => {
    const { filterCounts, remoteFiltered, VIEWS } = await import('./pipelineView');
    const jobs = [
      j({ location: 'Remote' }),
      j({ location: 'Austin, TX' }),
      j({ status: 'Applied', appliedAt: '2026-11-01', location: 'Remote' } as Partial<Job>),
      j({ status: 'Applied', appliedAt: '2026-11-01', location: 'Austin, TX' } as Partial<Job>),
    ];
    for (const remoteOnly of [false, true]) {
      const counts = filterCounts(jobs, undefined, remoteOnly);
      for (const f of VIEWS)
        expect(counts[f]).toBe(
          visibleJobs(jobs, { ...DEFAULT_VIEW, filter: f, remoteOnly }).length,
        );
    }
    expect(remoteFiltered(jobs, true)).toHaveLength(2);
    expect(remoteFiltered(jobs, false)).toHaveLength(4);
  });
});
