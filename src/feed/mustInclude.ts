// Must include (Calibrate, 2026-10-23): per track, the words a posting has to mention, in its title
// or its description, to be listed at all. The Design Systems track holds "systems": a posting
// that never says system or systems is of no interest (Adrian). Kept in `rjb_must_include` and
// synced in the blob (v11, ADR 0008 addendum). An entry is the user's own: one with no terms means
// they cleared it, so the one-time move to systems-only (systemsOnly.ts) never runs again. It
// also holds the ATS roles switched off (`atsOff`), which leave every search but stay on the track.
// Terms are exact phrases (Adrian 2026-10-23: "'design system' needs to be worded exactly that
// way"): "design system" matches design systems / design-system, never "system design" or the two
// words apart. Two per-track toggles pick the fields searched (title, description); both off reads
// as title only. The toggles ride in the same v11 entry as optional fields (absent = on), so an
// older client just ignores them.
// Storage is untrusted: anything malformed reads as "no entry".
import { useMemo } from 'react';
import { liveStorage } from '../liveStorage';
import { loadPersisted, savePersisted } from '../persisted';
import { htmlToText } from './html';
import { inflect } from './match';

export const MUST_INCLUDE_KEY = 'rjb_must_include';
const MAX_TERMS = 20;

export interface MustInclude {
  /** A posting is listed only when its title or description mentions one (whole words). */
  terms: string[];
  /** The track's ATS roles switched off: kept on the track, left out of its searches. */
  atsOff: string[];
  /** Search the title (absent = on). */
  inTitle?: boolean;
  /** Search the description (absent = on). */
  inText?: boolean;
  /** The one-time move of the pack's bare "systems" to "design system" has run (phraseMove.ts). */
  phrase?: boolean;
  /** Related titles let a posting in on a design system rule (absent = on; RELATED_TITLES). */
  related?: boolean;
  /** Related titles switched off, by id. */
  relatedOff?: string[];
}

/** What a filter needs: the terms and the fields to look in. A bare list searches both. */
export type IncludeRule =
  string[] | Pick<MustInclude, 'terms' | 'inTitle' | 'inText' | 'related' | 'relatedOff'>;

/** Related titles (Adrian 2026-10-23): on a rule that asks for "design system(s)", a posting
 *  whose title names one of these passes too, when its description says "design system(s)" as a
 *  phrase (Design Technologist: its title alone), and for Design Engineer also mentions
 *  AI-assisted work. All on by default; each can be switched off. */
export interface RelatedTitle {
  id: string;
  /** Phrases the title is matched against (same phrase rules as must include). */
  phrases: string[];
  /** Passes on the title alone. */
  titleAlone?: boolean;
  /** The description must also mention one of AI_TERMS. */
  needsAi?: boolean;
}

export const RELATED_TITLES: RelatedTitle[] = [
  { id: 'Design Technologist', phrases: ['design technologist'], titleAlone: true },
  { id: 'UI Platform', phrases: ['ui platform'] },
  { id: 'Component Library', phrases: ['component library'] },
  { id: 'Frontend Platform', phrases: ['frontend platform', 'front end platform'] },
  { id: 'Design Engineer', phrases: ['design engineer'], needsAi: true },
];

export const AI_TERMS = [
  'AI-assisted',
  'Claude',
  'Claude Code',
  'Cursor',
  'Copilot',
  'LLM',
  'AI tools',
  'agentic',
];
const RELATED_IDS = new Set(RELATED_TITLES.map((r) => r.id));

const UNSAFE = ['__proto__', 'constructor', 'prototype'];
const norm = (s: string) => s.trim().toLowerCase();

function cleanList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    if (typeof x !== 'string' || !x.trim() || seen.has(norm(x))) continue;
    seen.add(norm(x));
    out.push(x.trim());
  }
  return out;
}

function sanitizeOne(raw: unknown): MustInclude | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: MustInclude = {
    terms: cleanList(o.terms).slice(0, MAX_TERMS),
    atsOff: cleanList(o.atsOff),
  };
  // Only the non-default values are kept, so an entry without them reads (and syncs) as before.
  if (o.inTitle === false) out.inTitle = false;
  if (o.inText === false) out.inText = false;
  if (o.phrase === true) out.phrase = true;
  if (o.related === false) out.related = false;
  const relatedOff = cleanList(o.relatedOff).filter((id) => RELATED_IDS.has(id));
  if (relatedOff.length) out.relatedOff = relatedOff;
  return out;
}

export function sanitizeMustInclude(raw: unknown): Record<string, MustInclude> {
  const out: Record<string, MustInclude> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    const ok = id && !UNSAFE.includes(id) ? sanitizeOne(v) : null;
    if (ok) out[id] = ok;
  }
  return out;
}

const readAll = () => sanitizeMustInclude(loadPersisted<unknown>(MUST_INCLUDE_KEY, {}));
const live = liveStorage(MUST_INCLUDE_KEY);
const write = (all: Record<string, MustInclude>) => {
  savePersisted(MUST_INCLUDE_KEY, all);
  live.notify();
};

/** Every track's entry (for the sync blob and backup). */
export const getAllMustInclude = readAll;

/** Replace the whole store (a pull, a restore) and notify subscribers. */
export function replaceMustInclude(all: Record<string, MustInclude>): void {
  write(sanitizeMustInclude(all));
}

/** Union by track; `cloud` wins on a track both have (like the sweep titles). */
export function mergeMustInclude(
  cloud: Record<string, MustInclude>,
  local: Record<string, MustInclude>,
): Record<string, MustInclude> {
  return { ...local, ...cloud };
}

const NONE: MustInclude = { terms: [], atsOff: [] };

export const mustIncludeFor = (all: Record<string, MustInclude>, categoryId: string) =>
  all[categoryId] ?? NONE;

export const readMustInclude = (categoryId: string): MustInclude =>
  mustIncludeFor(readAll(), categoryId);

/** Whether the track has an entry at all (set by a pack, the move, or the user). */
export const hasMustInclude = (categoryId: string): boolean => categoryId in readAll();

/** Write a track's entry (merged over what it has). */
export function setMustInclude(categoryId: string, patch: Partial<MustInclude>): void {
  if (!categoryId || UNSAFE.includes(categoryId)) return;
  const all = readAll();
  const next = sanitizeOne({ ...mustIncludeFor(all, categoryId), ...patch });
  if (next) all[categoryId] = next;
  write(all);
}

/** The track's ATS roles that are on. */
export const activeAtsRoles = (atsRoles: string[], m: MustInclude): string[] => {
  const off = new Set(m.atsOff.map(norm));
  return atsRoles.filter((r) => !off.has(norm(r)));
};

/** Text as the phrase matcher reads it: tags stripped, lower case, a hyphen inside a word one
 *  space ("Design-Systems" → "design systems"). A separator breaks a phrase: a spaced hyphen, an
 *  en or em dash, , | / : ; & · • become " | ", so "Design - Systems" is not "design systems". */
export function normalizeForPhrase(text: string): string {
  const plain = /<[a-z!/]/i.test(text) ? htmlToText(text) : text;
  return ` ${plain
    .toLowerCase()
    .replace(
      /\s+[-\u2010-\u2012]+\s*|[-\u2010-\u2012]+\s+|[\u2013-\u2015,|/:;&\u00b7\u2022]/g,
      ' | ',
    )
    .replace(/[\s\-\u2010-\u2012]+/g, ' ')
    .trim()} `;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The regex for one term over normalized text: its words in order, one space apart, whole words,
 *  the last one singular or plural ("design system" ↔ "design systems"). Null for a blank term. */
export function phraseRegex(term: string): RegExp | null {
  const words = normalizeForPhrase(term).trim().split(' ').filter(Boolean);
  if (!words.length) return null;
  const last = inflect(words[words.length - 1]);
  const body = [...words.slice(0, -1).map(escapeRe), last].join(' ');
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`);
}

// A bare list is a plain phrase test: no related titles.
const ruleOf = (rule: IncludeRule) =>
  Array.isArray(rule) ? { terms: rule, inTitle: true, inText: true, related: false } : rule;

/** The fields a rule searches: both off reads as title only. */
export function includeFields(rule: IncludeRule): { title: boolean; text: boolean } {
  const r = ruleOf(rule);
  const title = r.inTitle !== false;
  const text = r.inText !== false;
  return !title && !text ? { title: true, text: false } : { title, text };
}

const regexesOf = (terms: string[]) =>
  terms.map(phraseRegex).filter((r): r is RegExp => r !== null);

const DS_RE = phraseRegex('design system') as RegExp;
const AI_RES = regexesOf(AI_TERMS);
const RELATED_RES = RELATED_TITLES.map((r) => regexesOf(r.phrases));

/** Says the phrase "design system(s)", hyphen or not, never "system design". */
export const saysDesignSystem = (s: string) => DS_RE.test(normalizeForPhrase(s));

/** The rule's own phrases, title and description as it says. */
function passesTerms(rule: IncludeRule, res: RegExp[], title: string, text: string): boolean {
  const f = includeFields(rule);
  const fields = [f.title ? normalizeForPhrase(title) : '', f.text ? normalizeForPhrase(text) : ''];
  return res.some((re) => fields.some((t) => t && re.test(t)));
}

/** The related titles that would let this posting in, on or off (none on a rule without a
 *  design system phrase). */
function relatedMatches(rule: IncludeRule, title: string, text: string): RelatedTitle[] {
  const r = ruleOf(rule);
  if (r.related === false || !r.terms.some(saysDesignSystem)) return [];
  const t = normalizeForPhrase(title);
  const hits = RELATED_TITLES.filter((_, i) => RELATED_RES[i].some((re) => re.test(t)));
  if (!hits.length) return [];
  const d = normalizeForPhrase(text);
  const ds = DS_RE.test(d);
  const ai = AI_RES.some((re) => re.test(d));
  return hits.filter((h) => h.titleAlone || (ds && (!h.needsAi || ai)));
}

/** True when the title or description (whichever the rule searches) says one of its phrases, or
 *  a related title that is on lets it in. No terms: true. */
export function passesInclude(rule: IncludeRule, title: string, text = ''): boolean {
  const res = regexesOf(ruleOf(rule).terms);
  if (!res.length) return true;
  if (passesTerms(rule, res, title, text)) return true;
  const off = new Set(ruleOf(rule).relatedOff ?? []);
  return relatedMatches(rule, title, text).some((h) => !off.has(h.id));
}

/** Per related title, how many postings it lets in (or would, when off) that the rule's own
 *  phrases do not. */
export function relatedCounts(
  postings: { title: string; text: string }[],
  rule: IncludeRule,
): Record<string, number> {
  const out = Object.fromEntries(RELATED_TITLES.map((r) => [r.id, 0]));
  const res = regexesOf(ruleOf(rule).terms);
  if (!res.length || Array.isArray(rule)) return out;
  const r = { ...ruleOf(rule), related: true };
  for (const p of postings) {
    if (passesTerms(rule, res, p.title, p.text)) continue;
    for (const h of relatedMatches(r, p.title, p.text)) out[h.id]++;
  }
  return out;
}

/** Whether the related titles control applies to the rule (it asks for design system(s)). */
export const hasRelatedTitles = (rule: IncludeRule) => ruleOf(rule).terms.some(saysDesignSystem);

/** Any of `terms` in any of `texts` (both fields on). */
export function mentionsAny(terms: string[], ...texts: string[]): boolean {
  return passesInclude(terms, texts[0] ?? '', texts.slice(1).join('\n'));
}

/** Postings (or roles) that pass the must-include rule. */
export function keepIncluded<P extends { title: string; text: string }>(
  postings: P[],
  rule: IncludeRule,
): P[] {
  if (!ruleOf(rule).terms.some((t) => t.trim())) return postings;
  return postings.filter((p) => passesInclude(rule, p.title, p.text));
}

/** Every track's entry, live. */
export function useAllMustInclude(): Record<string, MustInclude> {
  const raw = live.useRaw();
  return useMemo(() => {
    try {
      return sanitizeMustInclude(raw ? JSON.parse(raw) : {});
    } catch {
      return {};
    }
  }, [raw]);
}

/** A track's entry, live. */
export function useMustInclude(categoryId: string): MustInclude {
  const all = useAllMustInclude();
  return useMemo(() => mustIncludeFor(all, categoryId), [all, categoryId]);
}
