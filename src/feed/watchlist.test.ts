import { beforeEach, describe, expect, it, vi } from 'vitest';

// The curation store builds a Supabase client at import time — stub it (same seam as
// src/curation/curationStore.test.ts) so these tests never touch the network.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({
      upsert: async () => ({ error: null }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import { addCategory, getCurationState, replaceCurationState } from '../curation/curationStore';
import { EMPTY_CURATION } from '../curation/types';
import { WATCH_GROUP_LABEL, boardUrlsFor, watchBoard } from './watchlist';

let cat: string;
beforeEach(() => {
  replaceCurationState(EMPTY_CURATION);
  cat = addCategory({ label: 'Design Systems' });
});

const watchTiles = () => {
  const s = getCurationState();
  const g = s.groups.filter((x) => x.categoryId === cat && x.label === WATCH_GROUP_LABEL);
  return { groups: g, tiles: s.tiles.filter((t) => g.some((x) => x.id === t.groupId)) };
};

describe('watchBoard', () => {
  it('creates the watch group once and adds a canonical board tile', () => {
    expect(watchBoard(cat, 'https://jobs.ashbyhq.com/ramp/34413f8d')).toEqual({
      ok: true,
      label: 'Ramp',
    });
    expect(watchBoard(cat, 'boards.greenhouse.io/figma')).toEqual({ ok: true, label: 'Figma' });
    const { groups, tiles } = watchTiles();
    expect(groups).toHaveLength(1);
    expect(tiles.map((t) => t.url)).toEqual([
      'https://jobs.ashbyhq.com/ramp',
      'https://boards.greenhouse.io/figma',
    ]);
    expect(tiles[0].name).toBe('Ramp jobs');
    expect(tiles[0].meta).toContain('Ashby');
  });

  it('refuses a link that is not a board, and says what a board link looks like', () => {
    const r = watchBoard(cat, 'https://www.linkedin.com/company/ramp');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('jobs.ashbyhq.com/company');
    expect(watchTiles().tiles).toHaveLength(0);
  });

  it('refuses a board the track already watches, in any URL form', () => {
    watchBoard(cat, 'https://jobs.lever.co/plaid');
    const r = watchBoard(cat, 'https://jobs.lever.co/Plaid/6ed76ce8');
    expect(r).toEqual({ ok: false, error: 'Already watching Plaid.' });
    expect(watchTiles().tiles).toHaveLength(1);
  });

  it('counts a board tile the user curated by hand as already watched', () => {
    const before = getCurationState();
    const gid = 'g-hand';
    replaceCurationState({
      ...before,
      groups: [
        ...before.groups,
        {
          id: gid,
          categoryId: cat,
          label: 'Apply Now',
          sortOrder: 0,
          archived: false,
          createdAt: '',
        },
      ],
      tiles: [
        {
          id: 't1',
          groupId: gid,
          name: 'Ramp',
          url: 'https://jobs.ashbyhq.com/ramp',
          meta: '',
          sortOrder: 0,
          createdAt: '',
        },
      ],
    });
    expect(watchBoard(cat, 'https://jobs.ashbyhq.com/ramp').ok).toBe(false);
  });
});

describe('boardUrlsFor', () => {
  it("lists every tile URL in the track's live groups, skipping archived groups and other tracks", () => {
    watchBoard(cat, 'https://jobs.ashbyhq.com/ramp');
    const other = addCategory({ label: 'Other' });
    watchBoard(other, 'https://jobs.lever.co/elsewhere');
    expect(boardUrlsFor(cat, getCurationState())).toEqual(['https://jobs.ashbyhq.com/ramp']);
  });
});
