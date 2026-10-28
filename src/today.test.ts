// The Today read model (simplify 2/9): the three counts on the home page and the words beside them.
import { describe, expect, it } from 'vitest';
import {
  activeTrackId,
  applyLine,
  countSources,
  followUpLine,
  KEYLESS_FEEDS,
  reviewLine,
  today,
  upcomingLine,
} from './today';
import { SOURCE_ENABLED } from './feed/fetchFeed';
import type { Category } from './curation/types';
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

const NO_REVIEW = { newToday: null, sources: 0 };

describe('today: Apply', () => {
  it('counts the To apply queue and starts at its head', () => {
    const jobs = [job(1), job(2), applied(3, 1), job(4, { archived: true })];
    const m = today(jobs, NO_REVIEW, NOW);
    expect(m.apply.count).toBe(2);
    // Newest saved first (the list is append-only), like the Pipeline's To apply.
    expect(m.apply.start?.url).toBe(jobs[1].url);
    expect(m.apply.resumeAt).toBe(-1);
  });

  it('resumes where Apply mode was left', () => {
    const jobs = [job(1), job(2), job(3)];
    const m = today(jobs, NO_REVIEW, NOW, jobIdOf(jobs[1].url));
    expect(m.apply.start?.url).toBe(jobs[1].url);
    expect(m.apply.resumeAt).toBe(1);
  });

  it('starts at the head when the last Apply job has left the queue', () => {
    const jobs = [job(1), applied(2, 0)];
    const m = today(jobs, NO_REVIEW, NOW, jobIdOf(jobs[1].url));
    expect(m.apply.start?.url).toBe(jobs[0].url);
    expect(m.apply.resumeAt).toBe(-1);
  });

  it('is empty with no saved jobs', () => {
    const m = today([applied(1, 2)], NO_REVIEW, NOW);
    expect(m.apply).toEqual({ count: 0, start: null, resumeAt: -1 });
  });
});

describe('today: Follow up', () => {
  it('lists the due jobs, most overdue first, and counts the rest as waiting', () => {
    const jobs = [applied(1, 8), applied(2, 12), applied(3, 2), job(4)];
    const m = today(jobs, NO_REVIEW, NOW);
    expect(m.followUp.due.map((j) => j.url)).toEqual([jobs[1].url, jobs[0].url]);
    expect(m.followUp.waiting).toBe(1);
    expect(m.followUp.next?.job.url).toBe(jobs[2].url);
  });

  it('counts the follow-ups that fall due in the coming 7 days as upcoming', () => {
    // Due in 5, 2 and 0 days (today, so due), and one applied today (due in 7: inside the week).
    const jobs = [applied(1, 2), applied(2, 5), applied(3, 7), applied(4, 0)];
    const m = today(jobs, NO_REVIEW, NOW);
    expect(m.followUp.due.map((j) => j.url)).toEqual([jobs[2].url]);
    expect(m.followUp.upcoming).toBe(3);
    expect(upcomingLine(3)).toBe('Upcoming: 3 this week');
    expect(upcomingLine(1)).toBe('Upcoming: 1 this week');
    expect(upcomingLine(0)).toBe('Nothing else this week');
  });

  it('has nothing due or waiting with no applications', () => {
    const m = today([job(1)], NO_REVIEW, NOW);
    expect(m.followUp).toEqual({ due: [], waiting: 0, upcoming: 0, next: null });
  });
});

describe('today: Review new', () => {
  it('passes the review counts through', () => {
    expect(today([], { newToday: 4, sources: 9 }, NOW).review).toEqual({
      newToday: 4,
      sources: 9,
    });
  });
});

describe('KEYLESS_FEEDS', () => {
  it('is HN and Remotive plus every aggregator switched on in fetchFeed.ts', () => {
    expect(KEYLESS_FEEDS).toBe(2 + Object.values(SOURCE_ENABLED).filter(Boolean).length);
  });
});

describe('countSources', () => {
  it('counts each distinct board once, plus the keyless feeds', () => {
    const urls = [
      'https://jobs.ashbyhq.com/ramp',
      'https://jobs.ashbyhq.com/Ramp',
      'https://boards.greenhouse.io/figma',
      'https://www.indeed.com/jobs?q=welder',
    ];
    expect(countSources(urls, 2)).toBe(4);
    expect(countSources([], 2)).toBe(2);
  });
});

describe('the words', () => {
  it('Review new says how many are new, from how many sources', () => {
    expect(reviewLine({ newToday: 3, sources: 12 })).toBe('3 new today from 12 sources');
    expect(reviewLine({ newToday: 1, sources: 1 })).toBe('1 new today from 1 source');
    expect(reviewLine({ newToday: 0, sources: 5 })).toBe('Nothing new today from 5 sources');
  });

  it('Review new names the sources while the new count is unknown', () => {
    expect(reviewLine({ newToday: null, sources: 12 })).toBe('New postings from 12 sources');
  });

  it('Apply says what is waiting', () => {
    expect(applyLine(0)).toBe('Nothing saved to apply to yet');
    expect(applyLine(1)).toBe('1 saved job, not yet applied');
    expect(applyLine(5)).toBe('5 saved jobs, not yet applied');
  });

  it('Follow up names the due companies, else the next one', () => {
    const jobs = [applied(1, 8), applied(2, 12), applied(3, 2)];
    expect(followUpLine(today(jobs, NO_REVIEW, NOW).followUp, NOW)).toBe(
      'Due: Company 2, Company 1',
    );
    const later = today([applied(3, 2)], NO_REVIEW, NOW).followUp;
    expect(followUpLine(later, NOW)).toBe('Nothing due. Next: Company 3, Mon, Nov 2');
    expect(followUpLine(today([], NO_REVIEW, NOW).followUp, NOW)).toBe(
      'Nothing waiting on a reply',
    );
  });

  it('Follow up names three companies and counts the rest', () => {
    const jobs = [1, 2, 3, 4, 5].map((n) => applied(n, 8 + n));
    expect(followUpLine(today(jobs, NO_REVIEW, NOW).followUp, NOW)).toBe(
      'Due: Company 5, Company 4, Company 3 and 2 more',
    );
  });
});

describe('activeTrackId', () => {
  const cats = [{ id: 'a' }, { id: 'b' }] as Category[];
  it('is the track Companies last showed, else the first', () => {
    localStorage.clear();
    expect(activeTrackId(cats)).toBe('a');
    localStorage.setItem('rjb_active_category', 'b');
    expect(activeTrackId(cats)).toBe('b');
    localStorage.setItem('rjb_active_category', 'gone');
    expect(activeTrackId(cats)).toBe('a');
    expect(activeTrackId([])).toBeNull();
    localStorage.clear();
  });
});
