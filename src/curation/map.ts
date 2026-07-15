// Pure row↔model mappers: camelCase app model (types.ts) ↔ snake_case Supabase row.
// One pair per table. `fromRow` drops user_id (the local store is single-account, and RLS
// already scopes every fetched row to auth.uid()); `toRow` re-attaches it for writes, which is
// the only field the caller must supply that the model doesn't carry. Kept pure + total so the
// round-trip is the test surface — no network, no store, no Supabase client here.
import type { Category, Group, Tile, Seniority } from './types';

// ---- snake_case DB row shapes (mirror the migrated tables) ----
export interface CategoryRow {
  id: string;
  user_id: string;
  label: string;
  titles: string[];
  ats_roles: string[];
  seniority: Seniority;
  location: string;
  tailor_role: string | null;
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupRow {
  id: string;
  user_id: string;
  category_id: string;
  label: string;
  sort_order: number;
  archived: boolean;
  created_at: string;
}

export interface TileRow {
  id: string;
  user_id: string;
  group_id: string;
  name: string;
  url: string;
  meta: string;
  sort_order: number;
  created_at: string;
}

// ---- categories ----
export function categoryFromRow(row: CategoryRow): Category {
  return {
    id: row.id,
    label: row.label,
    titles: row.titles ?? [],
    atsRoles: row.ats_roles ?? [],
    seniority: row.seniority,
    location: row.location,
    tailorRole: row.tailor_role ?? null,
    sortOrder: row.sort_order,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function categoryToRow(c: Category, userId: string): CategoryRow {
  return {
    id: c.id,
    user_id: userId,
    label: c.label,
    titles: c.titles,
    ats_roles: c.atsRoles,
    seniority: c.seniority,
    location: c.location,
    tailor_role: c.tailorRole,
    sort_order: c.sortOrder,
    archived: c.archived,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

// ---- groups ----
export function groupFromRow(row: GroupRow): Group {
  return {
    id: row.id,
    categoryId: row.category_id,
    label: row.label,
    sortOrder: row.sort_order,
    archived: row.archived,
    createdAt: row.created_at,
  };
}

export function groupToRow(g: Group, userId: string): GroupRow {
  return {
    id: g.id,
    user_id: userId,
    category_id: g.categoryId,
    label: g.label,
    sort_order: g.sortOrder,
    archived: g.archived,
    created_at: g.createdAt,
  };
}

// ---- tiles ----
export function tileFromRow(row: TileRow): Tile {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    url: row.url,
    meta: row.meta ?? '',
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

export function tileToRow(t: Tile, userId: string): TileRow {
  return {
    id: t.id,
    user_id: userId,
    group_id: t.groupId,
    name: t.name,
    url: t.url,
    meta: t.meta,
    sort_order: t.sortOrder,
    created_at: t.createdAt,
  };
}
