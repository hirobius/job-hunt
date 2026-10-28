// The Today read model (simplify #383): Apply and Follow up as Today shows them, and their words.
import { describe, expect, it } from 'vitest';
import { applyLine, today, upcomingLine } from './today';
import { jobIdOf } from './store';
import { ymd } from './jobEvents';
import type { Job } from './types';

const NOW = new Date(2026, 9, 28, 9, 0);
const daysAgo = (n: number) => ymd(new Date(2026, 9, 28 - n));

const job = (n: number, extra: Partial<Job> = {}): Job =>
  ({
    url: `https://co${n}.example.com/j/${n}`,
    title: `Role ${n}`,
    label: `Role ${n}`,
    company: `Company ${n}`,
    status: 'Saved',
    ...extra,
  }) as Job;

const applied = (n: number, ago: number, extra: Partial<Job> = {}) =>
  job(n, { status: 'Applied', applied: daysAgo(ago), ...extra });

describe('today: Apply', () => {
  it('counts the To apply queue and starts at its head', () => {
    const jobs = [job(1), job(2), applied(3, 1), job(4, { archived: true })];
    const m = today(jobs, NOW);
    expect(m.apply.count).toBe(2);
    // Newest saved first (the list is append-only), like the Pipeline's To apply.
    expect(m.apply.start?.url).toBe(jobs[1].url);
    expect(m.apply.resumeAt).toBe(-1);
  });

  it('resumes where Apply mode was left', () => {
    const jobs = [job(1), job(2), job(3)];
    const m = today(jobs, NOW, jobIdOf(jobs[1].url));
    expect(m.apply.start?.url).toBe(jobs[1].url);
    expect(m.apply.resumeAt).toBe(1);
  });

  it('starts at the head when the last Apply job has left the queue', () => {
    const jobs = [job(1), applied(2, 0)];
    const m = today(jobs, NOW, jobIdOf(jobs[1].url));
    expect(m.apply.start?.url).toBe(jobs[0].url);
    expect(m.apply.resumeAt).toBe(-1);
  });

  it('is empty with no saved jobs', () => {
    const m = today([applied(1, 2)], NOW);
    expect(m.apply).toEqual({ count: 0, start: null, resumeAt: -1 });
  });
});

describe('today: Follow up', () => {
  it('lists the due jobs, most overdue first, and counts the rest as waiting', () => {
    const jobs = [applied(1, 8), applied(2, 12), applied(3, 2), job(4)];
    const m = today(jobs, NOW);
    expect(m.followUp.due.map((j) => j.url)).toEqual([jobs[1].url, jobs[0].url]);
    expect(m.followUp.waiting).toBe(1);
  });

  it('counts the follow-ups that fall due in the coming 7 days as upcoming', () => {
    // Due in 5, 2 and 0 days (today, so due), and one applied today (due in 7: inside the week).
    const jobs = [applied(1, 2), applied(2, 5), applied(3, 7), applied(4, 0)];
    const m = today(jobs, NOW);
    expect(m.followUp.due.map((j) => j.url)).toEqual([jobs[2].url]);
    expect(m.followUp.upcoming).toBe(3);
    expect(upcomingLine(3)).toBe('Upcoming: 3 this week');
    expect(upcomingLine(1)).toBe('Upcoming: 1 this week');
    expect(upcomingLine(0)).toBe('Nothing else this week');
  });

  it('has nothing due or waiting with no applications', () => {
    const m = today([job(1)], NOW);
    expect(m.followUp).toEqual({ due: [], waiting: 0, upcoming: 0 });
  });
});

describe('the words', () => {
  it('Apply says what is waiting', () => {
    expect(applyLine(0)).toBe('Nothing saved to apply to yet');
    expect(applyLine(1)).toBe('1 saved job, not yet applied');
    expect(applyLine(5)).toBe('5 saved jobs, not yet applied');
  });
});
