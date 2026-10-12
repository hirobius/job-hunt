// Starter packs for first-run onboarding (issue #59 / B1). Each pack maps its content
// (packContent.ts) into ONE curation Category (+ its groups/tiles) via the store's own mutators.
// Fork-on-pick: seeding copies the content into the user's editable rows — they own it after.
//
// ⚠️ v1 is provisional (owner unsure of the ideal set) — keep this list trivially editable; add or
// remove a pack by editing STARTER_PACKS + CONTENT_FOR. "blank" seeds an empty category to build on.
import { addCategory, addGroup, addTile } from './curationStore';
import {
  CONSULTING_PACK,
  DESIGN_SYSTEMS_PACK,
  SERVICENOW_PACK,
  TRADES_PACK,
  type PackContent,
} from './packContent';

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
 *  new category id. `location`, when non-blank, overrides the pack's default (onboarding sets it). */
export function seedPack(packId: string, location?: string): string {
  const content = CONTENT_FOR[packId];
  const label = STARTER_PACKS.find((p) => p.id === packId)?.label ?? 'My Track';
  const loc = (location ?? '').trim() || content?.location || '';
  const categoryId = addCategory({
    label,
    titles: content ? [...content.titles] : [],
    atsRoles: content ? [...content.atsRoles] : [],
    seniority: content?.seniority ?? 'any',
    location: loc,
  });
  content?.groups.forEach((g, gi) => {
    const groupId = addGroup(categoryId, { label: g.label, sortOrder: gi, archived: !!g.archived });
    g.tiles.forEach((t, ti) =>
      addTile(groupId, { name: t.name, url: t.url, meta: t.meta, sortOrder: ti }),
    );
  });
  return categoryId;
}
