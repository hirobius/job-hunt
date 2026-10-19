import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW,
  filterCounts,
  getPipelineView,
  resetPipelineView,
  setPipelineView,
  visibleJobs,
} from './pipelineView';
import type { Job } from './types';

const job = (url: string, extra: Partial<Job> = {}): Job => ({ url, label: url, ...extra }) as Job;
const saved = job('https://a.example/1', { label: 'Alpha welder', company: 'Acme' });
const applied = job('https://b.example/2', { label: 'Beta fitter', status: 'Applied' });
const pinned = job('https://c.example/3', { label: 'Gamma', status: 'Applied', priority: true });
const retired = job('https://d.example/4', { label: 'Delta', archived: true });
const all = [saved, applied, pinned, retired];

beforeEach(resetPipelineView);

describe('pipelineView', () => {
  it('starts on Active, recently added, no search', () => {
    expect(getPipelineView()).toEqual(DEFAULT_VIEW);
    expect(DEFAULT_VIEW).toEqual({ filter: 'active', sort: 'recent', q: '' });
  });

  it.each([
    ['active', ['Alpha welder', 'Gamma']],
    ['starred', ['Gamma']],
    ['Applied', ['Beta fitter', 'Gamma']],
    ['retired', ['Delta']],
    ['all', ['Alpha welder', 'Beta fitter', 'Delta', 'Gamma']],
  ] as const)('filter %s', (filter, titles) => {
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

  it('counts every filter', () => {
    expect(filterCounts(all)).toMatchObject({
      active: 2,
      starred: 1,
      all: 4,
      Applied: 2,
      retired: 1,
    });
  });

  it('set merges into the shared state and reset restores the default', () => {
    setPipelineView({ filter: 'Applied' });
    setPipelineView({ q: 'x' });
    expect(getPipelineView()).toEqual({ filter: 'Applied', sort: 'recent', q: 'x' });
    resetPipelineView();
    expect(getPipelineView()).toEqual(DEFAULT_VIEW);
  });
});
