import { describe, expect, it } from 'vitest';
import {
  categoryFromRow,
  categoryToRow,
  groupFromRow,
  groupToRow,
  tileFromRow,
  tileToRow,
  type CategoryRow,
  type GroupRow,
  type TileRow,
} from './map';
import type { Category, Group, Tile } from './types';

const UID = 'user-123';

const categoryRow: CategoryRow = {
  id: 'cat-1',
  user_id: UID,
  label: 'Welding',
  titles: ['Welder', 'TIG Welder'],
  ats_roles: ['welder'],
  seniority: 'entry',
  location: 'Spokane, WA',
  tailor_role: 'Welder-Fabricator',
  sort_order: 2,
  archived: false,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-02T00:00:00.000Z',
};

const groupRow: GroupRow = {
  id: 'grp-1',
  user_id: UID,
  category_id: 'cat-1',
  label: 'Fab shops',
  sort_order: 1,
  archived: true,
  created_at: '2026-07-01T00:00:00.000Z',
};

const tileRow: TileRow = {
  id: 'tile-1',
  user_id: UID,
  group_id: 'grp-1',
  name: 'Acme Fab',
  url: 'https://acme.example/careers',
  meta: 'Apply direct',
  sort_order: 0,
  created_at: '2026-07-01T00:00:00.000Z',
};

describe('map: categories', () => {
  it('fromRow drops user_id and camelCases', () => {
    const c = categoryFromRow(categoryRow);
    expect(c).toEqual<Category>({
      id: 'cat-1',
      label: 'Welding',
      titles: ['Welder', 'TIG Welder'],
      atsRoles: ['welder'],
      seniority: 'entry',
      location: 'Spokane, WA',
      tailorRole: 'Welder-Fabricator',
      sortOrder: 2,
      archived: false,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });
    expect('user_id' in c).toBe(false);
  });

  it('round-trips row → model → row (user_id re-attached)', () => {
    expect(categoryToRow(categoryFromRow(categoryRow), UID)).toEqual(categoryRow);
  });

  it('preserves a null tailorRole through the round-trip', () => {
    const row = { ...categoryRow, tailor_role: null };
    const model = categoryFromRow(row);
    expect(model.tailorRole).toBeNull();
    expect(categoryToRow(model, UID)).toEqual(row);
  });

  it('defaults missing array columns to empty arrays', () => {
    const row = {
      ...categoryRow,
      titles: undefined,
      ats_roles: undefined,
    } as unknown as CategoryRow;
    const model = categoryFromRow(row);
    expect(model.titles).toEqual([]);
    expect(model.atsRoles).toEqual([]);
  });
});

describe('map: groups', () => {
  it('round-trips and camelCases category_id', () => {
    const g = groupFromRow(groupRow);
    expect(g).toEqual<Group>({
      id: 'grp-1',
      categoryId: 'cat-1',
      label: 'Fab shops',
      sortOrder: 1,
      archived: true,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    expect(groupToRow(g, UID)).toEqual(groupRow);
  });
});

describe('map: tiles', () => {
  it('round-trips and camelCases group_id', () => {
    const t = tileFromRow(tileRow);
    expect(t).toEqual<Tile>({
      id: 'tile-1',
      groupId: 'grp-1',
      name: 'Acme Fab',
      url: 'https://acme.example/careers',
      meta: 'Apply direct',
      sortOrder: 0,
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    expect(tileToRow(t, UID)).toEqual(tileRow);
  });

  it('defaults a null meta to empty string', () => {
    const row = { ...tileRow, meta: null } as unknown as TileRow;
    expect(tileFromRow(row).meta).toBe('');
  });
});
