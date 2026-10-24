// Starter packs for first-run onboarding (issue #59 / B1). Each pack maps its content
// (packContent.ts) into ONE curation Category (+ its groups/tiles) via the store's own mutators.
// Fork-on-pick: seeding copies the content into the user's editable rows — they own it after.
//
// ⚠️ v1 is provisional (owner unsure of the ideal set) — keep this list trivially editable; add or
// remove a pack by editing STARTER_PACKS + CONTENT_FOR. "blank" seeds an empty category to build on.
import { parseBoardUrl } from '../feed/sources/ats';
import { addTargets, type Target } from '../feed/targets';
import { addBoardTiles } from '../feed/watchlist';
import { setMustInclude } from '../feed/mustInclude';
import { SCORED_TRACK_COPY } from '../tracks/forTrack';
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
import { localizeTile, placeKey } from './localize';

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
    label: 'Design Systems',
    blurb: SCORED_TRACK_COPY,
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
 *  new category id. `location` is the track's (onboarding sets it); blank means anywhere, with no
 *  pack default (Adrian 2026-10-22), and the pack's local search links follow it (`localizeTile`);
 *  `opts.titles`, when non-empty, replaces the pack's title chips ("Build your own" needs one);
 *  `opts.label` names the track (the sample track is "Sample"). */
export function seedPack(
  packId: string,
  location?: string,
  opts: { titles?: string[]; label?: string } = {},
): string {
  const content = CONTENT_FOR[packId];
  // "Build your own" is an instruction, not a name: that track is named after its first title.
  const label =
    opts.label ??
    (packId === 'blank'
      ? opts.titles?.[0]?.trim() || 'My track'
      : (STARTER_PACKS.find((p) => p.id === packId)?.label ?? 'My track'));
  const loc = (location ?? '').trim();
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
      g.tiles.map((t, ti) => ({ ...localizeTile(t, loc), sortOrder: ti })),
    );
  });
  // The pack's company boards, filed as the track's own editable "Watched companies" group.
  if (content?.boards.length) addBoardTiles(categoryId, content.boards);
  addPackTargets(categoryId, content?.targets);
  if (content?.mustInclude)
    setMustInclude(categoryId, {
      terms: [...content.mustInclude],
      phrase: true,
      ...(content.mustIncludeTitleOnly ? { inText: false } : {}),
    });
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

/** Labels a pack's tracks were seeded with before a rename: those tracks still belong to it. */
const FORMER_LABELS: Record<string, readonly string[]> = {
  designsystems: ['Design Systems / Design Eng'],
};

/** The starter pack a track's label belongs to (matching the onboarding label, the pack's own or a
 *  former one, ignoring case), so Live postings can suggest that pack's boards to a track made
 *  earlier. */
export function packIdForLabel(label: string): string | undefined {
  const want = label.trim().toLowerCase();
  if (!want) return undefined;
  return Object.entries(CONTENT_FOR).find(
    ([id, c]) =>
      c &&
      [STARTER_PACKS.find((p) => p.id === id)?.label, c.label, ...(FORMER_LABELS[id] ?? [])].some(
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
  // By place-free key: a link seeded before links followed the location (raw Spokane), or under
  // another location, is the same tile as the pack link localized now (review of ef40fc6).
  const urls = new Set(
    state.tiles.filter((x) => groups.some((g) => g.id === x.groupId)).map((x) => placeKey(x.url)),
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
    const fresh = pg.tiles.flatMap((raw, ti) => {
      const key = placeKey(raw.url);
      if (urls.has(key)) return [];
      urls.add(key);
      const tile = localizeTile(raw, cat.location ?? '');
      return [{ ...tile, sortOrder: 1000 + ti }];
    });
    addTiles(groupId, fresh);
    res.tiles += fresh.length;
  });
  res.targets = addPackTargets(categoryId, content.targets);
  return res;
}
