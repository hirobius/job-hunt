// What kind of role an opening is, for a design-systems track: Design systems, Product design,
// Design engineering (shown as "Engineering-heavy") or Other. Deterministic rules on the title, and
// on the body only where the title leaves it open (the same stance as match.ts and the JD screener).
// A design-systems track ranks Design systems first and folds the engineering-heavy roles behind a
// quiet disclosure; every other track keeps its order (the words here are about design work).
import { DESIGN_SYSTEM_SEARCH, teamSearchFor } from './teamTopics';

export type RoleType = 'design-systems' | 'product-design' | 'design-engineering' | 'other';

/** The design-system words. "system design" is not one: the words must come in this order. */
const DS_RE =
  /\bdesign[- ]?systems?\b|\bcomponent[- ]librar(?:y|ies)\b|\bdesign[- ]?tokens?\b|\bui[- ]kits?\b|\bfigma librar(?:y|ies)\b|\bdesign[- ]?ops\b|\bdesign operations\b/gi;
/** Engineering by trade: these stay engineering even with "design systems" after them. */
const HARD_ENG_RE =
  /\b(?:software|front[- ]?end|back[- ]?end|full[- ]?stack|web|ios|android|mobile|platform|infrastructure|developer|programmer|sre|devops|data|ui engineer)\b/i;
const ENG_TITLE_RE = /\b(?:engineer(?:ing)?|developer|programmer|technologist|architect)s?\b/i;
const DESIGNER_RE =
  /\bdesigners?\b|\b(?:ux|ui|product|visual|interaction|interface|experience) design\b|\bhead of design\b|\bdesign (?:lead|manager|director)\b|\b(?:director|vp|manager) of design\b/i;
const DESIGN_CUE_RE =
  /\b(?:portfolio|interaction design|visual design|ux design|user research|prototyp\w*|figma|design craft|designers?)\b/gi;
const ENG_CUE_RE =
  /\b(?:typescript|javascript|react|css|html|ci\/cd|apis?|backend|testing|software engineering|computer science|kubernetes|node(?:\.js)?)\b/gi;

const count = (re: RegExp, s: string) => s.match(re)?.length ?? 0;
/** The body centres on the design system: it names one at least three times. */
const centresOnDs = (text: string) => count(DS_RE, text) >= 3;
/** The body asks for a designer, not an engineer. */
const designLed = (text: string) => {
  const design = count(DESIGN_CUE_RE, text);
  return design >= 3 && design > count(ENG_CUE_RE, text);
};
const has = (re: RegExp, s: string) => {
  re.lastIndex = 0;
  return re.test(s);
};

export function classifyRole(title: string, text = ''): RoleType {
  if (has(DS_RE, title))
    return HARD_ENG_RE.test(title) && !designLed(text) ? 'design-engineering' : 'design-systems';
  if (/\bdesign technologist\b/i.test(title)) return 'design-systems';
  if (ENG_TITLE_RE.test(title))
    return !HARD_ENG_RE.test(title) && centresOnDs(text) ? 'design-systems' : 'design-engineering';
  if (DESIGNER_RE.test(title)) return centresOnDs(text) ? 'design-systems' : 'product-design';
  return centresOnDs(text) ? 'design-systems' : 'other';
}

const TAG: Record<RoleType, string> = {
  'design-systems': 'Design systems',
  'product-design': 'Product design',
  'design-engineering': 'Engineering-heavy',
  other: '',
};
/** The role row's tag, in plain words; '' for Other (no tag). */
export const roleTypeTag = (t: RoleType) => TAG[t];

/** A track whose terms are about design systems (the team search's own test, feed/teamTopics.ts). */
export const isDesignSystemsTrack = (terms: string[]) =>
  teamSearchFor(terms) === DESIGN_SYSTEM_SEARCH;

const RANK: Record<RoleType, number> = {
  'design-systems': 0,
  'product-design': 1,
  other: 2,
  'design-engineering': 3,
};

type Classifiable = { title: string; text: string };
export const roleTypeOf = (p: Classifiable) => classifyRole(p.title, p.text);

/** Design systems first, then product design, then the rest, engineering last; stable within a type. */
export function orderByRoleType<T extends Classifiable>(rows: T[]): T[] {
  const rank = new Map(rows.map((r) => [r, RANK[roleTypeOf(r)]] as const));
  return [...rows].sort((a, b) => rank.get(a)! - rank.get(b)!);
}

/** Split off the engineering-heavy roles (when `fold`), keeping each half's order. */
export function foldRoles<T extends Classifiable>(
  rows: T[],
  fold: boolean,
): { shown: T[]; folded: T[] } {
  if (!fold) return { shown: rows, folded: [] };
  const shown: T[] = [];
  const folded: T[] = [];
  for (const r of rows) (roleTypeOf(r) === 'design-engineering' ? folded : shown).push(r);
  return { shown, folded };
}
