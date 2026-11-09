// The Feed's server read (#499): the trimmed-text RPC, else the table (before its migration runs).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  rpc: vi.fn(),
  rows: [] as unknown[],
  tableReads: 0,
}));
vi.mock('../supabase', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadSupabase: async () => ({
    rpc: db.rpc,
    from: () => {
      db.tableReads++;
      const q = {
        select: () => q,
        in: () => q,
        is: () => q,
        order: () => q,
        limit: async () => ({ data: db.rows, error: null }),
      };
      return q;
    },
  }),
}));

import { loadServerRows } from './postings';

const row = (id: number, text: string) => ({
  id,
  track_slug: 'design-systems',
  source: 'greenhouse',
  source_id: String(id),
  company: 'Acme',
  title: 'Design Systems Designer',
  location: 'Remote',
  remote: true,
  url: `https://boards.greenhouse.io/acme/jobs/${id}`,
  posted_at: null,
  score: 90,
  verdict: 'queue',
  reasons: [],
  fingerprint: `acme|${id}`,
  description_text: text,
  board: 'greenhouse:acme',
});

beforeEach(() => {
  db.rpc.mockReset();
  db.rows = [];
  db.tableReads = 0;
});

describe('loadServerRows', () => {
  it('reads feed_rows (trimmed text) and never the table', async () => {
    db.rpc.mockResolvedValue({ data: [row(1, 'trimmed')], error: null });
    const rows = await loadServerRows();
    expect(db.rpc).toHaveBeenCalledWith('feed_rows', { p_limit: 1000 });
    expect(rows.map((r) => r.descriptionText)).toEqual(['trimmed']);
    expect(db.tableReads).toBe(0);
  });

  it('falls back to the table while the RPC is not there yet', async () => {
    db.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Could not find', code: 'PGRST202' },
    });
    db.rows = [row(2, 'full text')];
    const rows = await loadServerRows();
    expect(rows.map((r) => r.descriptionText)).toEqual(['full text']);
    expect(db.tableReads).toBe(1);
  });
});
