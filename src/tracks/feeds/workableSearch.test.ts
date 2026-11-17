import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { setBoardKey } from '../../feed/boardSet';
import type { FeedContext } from './context';
import {
  findWorkableBoards,
  parseWorkableSearch,
  WORKABLE_PAGES,
  WORKABLE_QUERIES,
  workableSearchUrl,
} from './workableSearch';

const FIXTURE = JSON.parse(readFileSync('src/tracks/feeds/fixtures/workable-search.json', 'utf8'));
const ctx = (o: Partial<FeedContext> = {}): FeedContext => ({
  fetch: vi.fn(async () => new Response(JSON.stringify(FIXTURE))),
  env: () => undefined,
  now: () => new Date('2026-11-17T06:23:00Z'),
  sleep: vi.fn(async () => {}),
  ...o,
});

describe('Workable job search', () => {
  it('asks for remote roles, with the page token', () => {
    const u = new URL(workableSearchUrl('design system', 'tok2'));
    expect(u.host).toBe('jobs.workable.com');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      query: 'design system',
      workplace: 'remote',
      pageToken: 'tok2',
    });
  });

  it('keeps each Workable board once, from any link field, and the next token', () => {
    const { boards, next } = parseWorkableSearch(FIXTURE, '2026-11-17');
    expect(next).toBe('tok2');
    expect(boards.map(setBoardKey)).toEqual(['workable:omega-health', 'workable:sigma-co']);
    expect(boards[0]).toMatchObject({ company: 'Omega Health', lastChecked: '2026-11-17' });
    expect(parseWorkableSearch(null, 'd')).toEqual({ boards: [], next: '' });
  });

  it('reads every query up to its page cap, merging boards', async () => {
    const c = ctx();
    const run = await findWorkableBoards(c);
    expect(run.calls).toBe(WORKABLE_QUERIES.length * WORKABLE_PAGES);
    expect(run.boards).toHaveLength(2);
    expect(run.errors).toEqual([]);
  });

  it('logs a failed call by name and goes on with the next query', async () => {
    const c = ctx({ fetch: vi.fn(async () => new Response('', { status: 503 })) });
    const run = await findWorkableBoards(c);
    expect(run.calls).toBe(WORKABLE_QUERIES.length);
    expect(run.errors[0]).toBe('Workable job search: HTTP 503');
  });
});
