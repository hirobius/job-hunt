// Starter packs for first-run onboarding (issue #59 / B1). Each pack maps its content
// (packContent.ts) into ONE curation Category (+ its groups/tiles) via the store's own mutators.
// Fork-on-pick: seeding copies the content into the user's editable rows — they own it after.
//
// ⚠️ v1 is provisional (owner unsure of the ideal set) — keep this list trivially editable; add or
// remove a pack by editing STARTER_PACKS + CONTENT_FOR. "blank" seeds an empty category to build on.
import { parseBoardUrl } from '../feed/sources/ats';
import { addTargets, type Target } from '../feed/targets';
import { addBoardTiles } from '../feed/watchlist';
import type { PackCompany } from '../radar/directory';
import { addCategory, addGroup, addTiles, getCurationState, updateCategory } from './curationStore';
import {
  CONSULTING_PACK,
  DESIGN_SYSTEMS_PACK,
  SERVICENOW_PACK,
  TRADES_PACK,
  type PackContent,
} from './packContent';
import { sameGroupLabel } from './groupLabel';

export interface StarterPack {
  id: string;
  label: string;
  blurb: string;
}

export const STARTER_PACKS: StarterPack[] = [
  {
    id: 'consulting',
    label: 'Implementation Consulting',
    blurb: 'Software implementation, onboarding & professional-services roles',
  },
  {
    id: 'servicenow',
    label: 'ServiceNow',
    blurb: 'Strictly ServiceNow — developer, admin, consultant & architect roles',
  },
  {
    id: 'designsystems',
    label: 'Design Systems / Design Eng',
    blurb: 'Remote design-systems & design-engineering roles',
  },
  {
    id: 'trades',
    label: 'Skilled Trades',
    blurb: 'Hands-on trades — sheet metal, welding, fabrication',
  },
  {
    id: 'blank',
    label: 'Build your own',
    blurb: 'Start empty and add your own titles + links',
  },
];

const CONTENT_FOR: Record<string, PackContent | undefined> = {
  consulting: CONSULTING_PACK,
  servicenow: SERVICENOW_PACK,
  designsystems: DESIGN_SYSTEMS_PACK,
  trades: TRADES_PACK,
  // 'blank' → no content (empty category).
};

/** Seed one starter pack into the curation store as a Category (+ its groups/tiles). Returns the
 *  new category id. `location`, when non-blank, overrides the pack's default (onboarding sets it);
 *  `opts.titles`, when non-empty, replaces the pack's title chips ("Build your own" needs one). */
export function seedPack(
  packId: string,
  location?: string,
  opts: { titles?: string[] } = {},
): string {
  const content = CONTENT_FOR[packId];
  const label = STARTER_PACKS.find((p) => p.id === packId)?.label ?? 'My Track';
  const loc = (location ?? '').trim() || content?.location || '';
  const categoryId = addCategory({
    label,
    titles: opts.titles?.length ? [...opts.titles] : content ? [...content.titles] : [],
    atsRoles: content ? [...content.atsRoles] : [],
    seniority: content?.seniority ?? 'any',
    location: loc,
  });
  content?.groups.forEach((g, gi) => {
    const groupId = addGroup(categoryId, { label: g.label, sortOrder: gi, archived: !!g.archived });
    addTiles(
      groupId,
      g.tiles.map((t, ti) => ({ name: t.name, url: t.url, meta: t.meta, sortOrder: ti })),
    );
  });
  // The pack's company boards, filed as the track's own editable "Watched companies" group.
  if (content?.boards.length) addBoardTiles(categoryId, content.boards);
  addPackTargets(categoryId, content?.targets);
  return categoryId;
}

/** File a pack's target companies as the track's outreach targets, keyed by board slug, skipping
 *  any the track already has (#198). Returns how many were added. */
function addPackTargets(categoryId: string, companies: readonly PackCompany[] = []): number {
  const rows = companies.flatMap((c): Omit<Target, 'savedAt'>[] => {
    const board = parseBoardUrl(c.url);
    return board ? [{ login: board.slug.toLowerCase(), company: c.company, board }] : [];
  });
  return addTargets(categoryId, rows);
}

/** The starter pack a track's label belongs to (matching the onboarding label or the pack's own,
 *  ignoring case), so Live postings can suggest that pack's boards to a track made earlier. */
export function packIdForLabel(label: string): string | undefined {
  const want = label.trim().toLowerCase();
  if (!want) return undefined;
  return Object.entries(CONTENT_FOR).find(
    ([id, c]) =>
      c &&
      [STARTER_PACKS.find((p) => p.id === id)?.label, c.label].some(
        (l) => l?.toLowerCase() === want,
      ),
  )?.[0];
}

/** The board urls suggested for a pack id; empty when it has none. */
export const boardsForPack = (packId: string | undefined): readonly string[] =>
  (packId && CONTENT_FOR[packId]?.boards) || [];

export interface TopUpResult {
  titles: number;
  atsRoles: number;
  groups: number;
  tiles: number;
  targets: number;
}

/**
 * Bring an existing track up to date with its starter pack without touching the user's edits:
 * add any pack titles / ATS terms it lacks (case-insensitive), any pack group it lacks (matched by
 * label), any pack link whose URL the track doesn't already have, and any pack outreach target it
 * lacks. Nothing is removed or
 * renamed. Returns how many of each it added (all zero = already current).
 */
export function topUpFromPack(categoryId: string, packId: string): TopUpResult {
  const content = CONTENT_FOR[packId];
  const res: TopUpResult = { titles: 0, atsRoles: 0, groups: 0, tiles: 0, targets: 0 };
  const state = getCurationState();
  const cat = state.categories.find((c) => c.id === categoryId);
  if (!content || !cat) return res;

  const merge = (have: string[], want: string[]) => {
    const seen = new Set(have.map((x) => x.toLowerCase()));
    const add = want.filter((x) => !seen.has(x.toLowerCase()));
    return { next: [...have, ...add], added: add.length };
  };
  const t = merge(cat.titles, content.titles);
  const a = merge(cat.atsRoles, content.atsRoles);
  res.titles = t.added;
  res.atsRoles = a.added;
  if (t.added || a.added) updateCategory(categoryId, { titles: t.next, atsRoles: a.next });

  const groups = state.groups.filter((g) => g.categoryId === categoryId);
  const urls = new Set(
    state.tiles.filter((x) => groups.some((g) => g.id === x.groupId)).map((x) => x.url),
  );
  content.groups.forEach((pg, gi) => {
    // Case-insensitive: an older synced 'Apply Now' is the pack's 'Apply now' group.
    let groupId = groups.find((g) => sameGroupLabel(g.label, pg.label))?.id;
    if (!groupId) {
      groupId = addGroup(categoryId, {
        label: pg.label,
        sortOrder: groups.length + gi,
        archived: !!pg.archived,
      });
      res.groups++;
    }
    const fresh = pg.tiles.flatMap((tile, ti) => {
      if (urls.has(tile.url)) return [];
      urls.add(tile.url);
      return [{ name: tile.name, url: tile.url, meta: tile.meta, sortOrder: 1000 + ti }];
    });
    addTiles(groupId, fresh);
    res.tiles += fresh.length;
  });
  res.targets = addPackTargets(categoryId, content.targets);
  return res;
}
