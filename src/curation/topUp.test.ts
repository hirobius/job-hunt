import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: () => ({ upsert: async () => ({}), delete: () => ({ eq: async () => ({}) }) }),
  }),
}));

import {
  addCategory,
  addGroup,
  addTile,
  getCurationState,
  replaceCurationState,
} from './curationStore';
import { seedPack, topUpFromPack } from './starterPacks';
import { DESIGN_SYSTEMS_PACK } from './packContent';

afterEach(() => replaceCurationState({ categories: [], groups: [], tiles: [] }));

describe('topUpFromPack', () => {
  it('adds missing terms, groups and links to an older track and keeps the user’s edits', () => {
    const id = addCategory({
      label: 'Design Systems',
      titles: ['design systems engineer', 'My Own Title'],
      atsRoles: [],
    });
    const g = addGroup(id, { label: 'Apply Now' });
    addTile(g, { name: 'My link', url: 'https://example.com/mine' });
    const added = topUpFromPack(id, 'designsystems');
    const s = getCurationState();
    const cat = s.categories.find((c) => c.id === id)!;
    // Kept the user's title, did not duplicate the case-insensitive match, added the rest.
    expect(cat.titles).toContain('My Own Title');
    expect(cat.titles.filter((t) => t.toLowerCase() === 'design systems engineer')).toHaveLength(1);
    expect(cat.titles).toContain('Design Systems Lead');
    expect(cat.atsRoles).toContain('UI systems');
    // Existing group reused, user tile kept, pack tiles added; the watch group created.
    const groups = s.groups.filter((x) => x.categoryId === id);
    // The pack's group is 'Apply now' now; an older synced 'Apply Now' is the same group.
    expect(groups.filter((x) => x.label.toLowerCase() === 'apply now')).toHaveLength(1);
    expect(groups.some((x) => x.label === 'Watched companies')).toBe(true);
    const urls = s.tiles.map((t) => t.url);
    expect(urls).toContain('https://example.com/mine');
    expect(urls).toContain('https://jobs.ashbyhq.com/ramp');
    expect(added.titles + added.atsRoles + added.tiles).toBeGreaterThan(0);
  });

  it('is a no-op on a freshly seeded track', () => {
    const id = seedPack('designsystems');
    const before = getCurationState();
    const added = topUpFromPack(id, 'designsystems');
    expect(added).toEqual({ titles: 0, atsRoles: 0, groups: 0, tiles: 0, targets: 0 });
    expect(getCurationState().tiles).toHaveLength(before.tiles.length);
    expect(DESIGN_SYSTEMS_PACK.titles.length).toBeGreaterThan(0);
  });
});
