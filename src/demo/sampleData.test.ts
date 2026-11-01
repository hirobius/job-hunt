import { describe, expect, it } from 'vitest';
import { STATUSES } from '../types';
import { deriveJobState } from '../jobState';
import { sanitizeJobs } from '../store';
import { isSample, sampleJobs } from './sampleData';

// A fixed clock: the sample is dated relative to `now`, so tests pin it.
const NOW = new Date(2026, 9, 12, 10, 0, 0); // 2026-10-12 10:00 local
const jobs = sampleJobs(NOW);

const RESERVED = /(^|\.)(example\.(com|org|net)|[a-z0-9-]+\.test)$/i;

describe('sampleJobs', () => {
  it('is a small, believable pipeline (8–12 jobs)', () => {
    expect(jobs.length).toBeGreaterThanOrEqual(8);
    expect(jobs.length).toBeLessThanOrEqual(12);
  });

  it.each(STATUSES)('covers the %s status', (status) => {
    expect(jobs.some((j) => j.status === status)).toBe(true);
  });

  it('tags every record as sample data', () => {
    for (const j of jobs) {
      expect(j.demo).toBe(true);
      expect(isSample(j)).toBe(true);
    }
  });

  it('only links reserved, never-real domains', () => {
    for (const j of jobs) expect(new URL(j.url).hostname).toMatch(RESERVED);
  });

  it('is design-systems roles only (Adrian 2026-10-29)', () => {
    for (const j of jobs) expect(j.label, j.label).toMatch(/design system|design technologist/i);
  });

  it('has no duplicate URLs', () => {
    expect(new Set(jobs.map((j) => j.url)).size).toBe(jobs.length);
  });

  it('has at least two follow-ups due as of now', () => {
    const due = jobs.filter((j) => deriveJobState(j, NOW).followUp.due);
    expect(due.length).toBeGreaterThanOrEqual(2);
  });

  it('shows those due follow-ups in the default Active view (pinned)', () => {
    const due = jobs.filter((j) => deriveJobState(j, NOW).followUp.due);
    expect(due.filter((j) => deriveJobState(j, NOW).isActive).length).toBeGreaterThanOrEqual(2);
  });

  it('has at least two interviews scheduled in the coming days', () => {
    const today = '2026-10-12';
    const upcoming = jobs.flatMap((j) =>
      (j.events ?? []).filter((e) => e.kind === 'interview' && e.date > today),
    );
    expect(upcoming.length).toBeGreaterThanOrEqual(2);
  });

  it('keeps interviewing jobs in the default Active view (pinned)', () => {
    for (const j of jobs.filter((x) => x.status === 'Interviewing'))
      expect(deriveJobState(j, NOW).isActive).toBe(true);
  });

  it('dates every status change on or before now, oldest first', () => {
    for (const j of jobs) {
      const at = (j.history ?? []).map((h) => h.at);
      expect(at).toEqual([...at].sort());
      for (const a of at) expect(a <= '2026-10-12').toBe(true);
      if (j.history?.length) expect(j.history[j.history.length - 1].status).toBe(j.status);
    }
  });

  it('moves with the clock (dates are relative, not baked in)', () => {
    const later = sampleJobs(new Date(2027, 0, 20, 10));
    expect(later.map((j) => j.applied)).not.toEqual(jobs.map((j) => j.applied));
    const due = later.filter((j) => deriveJobState(j, new Date(2027, 0, 20, 10)).followUp.due);
    expect(due.length).toBeGreaterThanOrEqual(2);
  });

  it.each([0, 1, 12, 23])('keeps ≥2 follow-ups due and interviews ahead at %i:30 local', (h) => {
    const now = new Date(2026, 9, 12, h, 30);
    const list = sampleJobs(now);
    expect(list.filter((j) => deriveJobState(j, now).followUp.due).length).toBeGreaterThanOrEqual(
      2,
    );
    const upcoming = list.flatMap((j) =>
      (j.events ?? []).filter((e) => e.kind === 'interview' && e.date > '2026-10-12'),
    );
    expect(upcoming.length).toBeGreaterThanOrEqual(2);
  });

  it('survives the store normalizer with its tags and extra fields intact', () => {
    const stored = sanitizeJobs(JSON.parse(JSON.stringify(jobs)));
    expect(stored).toHaveLength(jobs.length);
    expect(stored.every(isSample)).toBe(true);
    expect(stored.some((j) => 'events' in j)).toBe(true);
  });
});

describe('isSample', () => {
  it.each([
    [{ demo: true }, true],
    [{ demo: false }, false],
    [{ demo: 'true' }, false],
    [{}, false],
  ])('%o → %s', (extra, expected) => {
    expect(isSample({ url: 'https://a.example.com', label: 'x', status: 'Saved', ...extra })).toBe(
      expected,
    );
  });
});
