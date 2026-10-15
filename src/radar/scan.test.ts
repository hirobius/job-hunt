import { describe, expect, it } from 'vitest';
import { boardReport, scanBoards } from './scan';
import { FetchError } from '../feed/sources/http';
import type { Board } from '../feed/sources/ats';

const ashby = (slug: string): Board => ({ kind: 'ashby', slug });
const job = (id: string, title: string) => ({
  id,
  title,
  jobUrl: `https://jobs.ashbyhq.com/x/${id}`,
  location: 'Remote',
  isRemote: true,
  descriptionPlain: 'Own the design system.',
});

describe('scanBoards', () => {
  it('reads every board, isolates failures, and says which boards closed or did not answer', async () => {
    const fetchJson = async (url: string) => {
      if (url.endsWith('/good')) return { jobs: [job('1', 'Design Engineer')] };
      if (url.endsWith('/gone')) throw new FetchError(404, url);
      throw new FetchError(0, url);
    };
    const r = await scanBoards([ashby('good'), ashby('gone'), ashby('down')], fetchJson);
    expect(r.postings.map((p) => p.title)).toEqual(['Design Engineer']);
    expect(r.boards).toEqual([
      { key: 'ashby:good', label: 'Good', outcome: 'ok', openings: 1 },
      { key: 'ashby:gone', label: 'Gone', outcome: 'closed', openings: 0 },
      { key: 'ashby:down', label: 'Down', outcome: 'unreachable', openings: 0 },
    ]);
  });

  it('never runs more than `concurrency` requests at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchJson = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { jobs: [] };
    };
    const boards = Array.from({ length: 12 }, (_, i) => ashby(`co${i}`));
    const progress: number[] = [];
    await scanBoards(boards, fetchJson, { concurrency: 3, onProgress: (n) => progress.push(n) });
    expect(peak).toBe(3);
    expect(progress[progress.length - 1]).toBe(12);
  });
});

describe('boardReport', () => {
  it('says how many boards were read and names the ones dropped', () => {
    expect(
      boardReport([
        { key: 'a', label: 'Acme', outcome: 'ok', openings: 2 },
        { key: 'b', label: 'Beta', outcome: 'closed', openings: 0 },
        { key: 'c', label: 'Cee', outcome: 'unreachable', openings: 0 },
      ]),
    ).toBe('1 board read · 1 closed (Beta) · 1 didn’t answer (Cee)');
    expect(boardReport([{ key: 'a', label: 'Acme', outcome: 'ok', openings: 2 }])).toBe(
      '1 board read',
    );
  });
});
