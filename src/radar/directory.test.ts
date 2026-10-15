import { describe, expect, it } from 'vitest';
import { RADAR_MAX_BOARDS, radarBoards, STARTER_DIRECTORY } from './directory';

describe('board directory', () => {
  it('every starter entry is a real Greenhouse, Lever or Ashby board', () => {
    expect(STARTER_DIRECTORY.length).toBeGreaterThan(20);
    expect(radarBoards([]).length).toBe(STARTER_DIRECTORY.length);
  });

  it('adds the track’s watched boards first, without duplicates, under the cap', () => {
    const boards = radarBoards([
      'https://jobs.ashbyhq.com/newco',
      'https://jobs.ashbyhq.com/ramp', // already in the starter list
      'https://example.com/not-a-board',
    ]);
    expect(boards[0]).toEqual({ kind: 'ashby', slug: 'newco' });
    expect(boards.filter((b) => b.slug.toLowerCase() === 'ramp')).toHaveLength(1);
    expect(boards.length).toBe(STARTER_DIRECTORY.length + 1);
    const many = Array.from({ length: 200 }, (_, i) => `https://jobs.lever.co/co${i}`);
    expect(radarBoards(many)).toHaveLength(RADAR_MAX_BOARDS);
  });
});
