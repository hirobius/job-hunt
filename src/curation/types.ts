// Per-account curated content — the model half of the curation data layer (epic #30, Phase 0b).
// A user curates their own board out of three nested concepts:
//   Category → Group → Tile  (a trade/pillar → a labelled section → a single link).
// These are the camelCase app-side models; the snake_case DB rows they map to live in map.ts.
// Additive + dormant: no existing UI reads these yet.

export type Seniority = 'entry' | 'experienced' | 'any';

/** A curated trade/track: its own search terms, seniority stance, and location. */
export interface Category {
  id: string;
  label: string;
  /** Title-search chips. */
  titles: string[];
  /** ATS hidden-jobs search terms. */
  atsRoles: string[];
  seniority: Seniority;
  location: string;
  /** Default target role for AI tailoring; null when unset. */
  tailorRole: string | null;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A labelled section inside a category. */
export interface Group {
  id: string;
  categoryId: string;
  label: string;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
}

/** A single curated link inside a group. */
export interface Tile {
  id: string;
  groupId: string;
  name: string;
  url: string;
  meta: string;
  sortOrder: number;
  createdAt: string;
}

/** The whole curated board for one account, held as a single immutable value in the store. */
export interface CurationState {
  categories: Category[];
  groups: Group[];
  tiles: Tile[];
}

export const EMPTY_CURATION: CurationState = { categories: [], groups: [], tiles: [] };
