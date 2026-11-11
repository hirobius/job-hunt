// The must-include check (mustInclude.ts holds the rule, its store and the phrase matcher): a
// posting is listed when its title or description (whichever the rule searches) says one of the
// rule's phrases, or a related title that is on names its title. Its own module (2026-11-11), so the
// design engineer guard (tracks/designRoleGuard.ts, shared with the scorer and the keyless feeds)
// stays out of the entry chunk: only the Feed, the auto-scan and the scorer's forTrack call it.
import { relatedTitleOk } from '../tracks/designRoleGuard';
import {
  hasRelatedTitles,
  includeFields,
  normalizeForPhrase,
  regexesOf,
  relatedIsOn,
  RELATED_TITLES,
  ruleOf,
  type IncludeRule,
  type RelatedTitle,
} from './mustInclude';

const RELATED_RES = RELATED_TITLES.map((r) => regexesOf(r.phrases));

/** The related titles a title names that are on (none on a rule without a design system phrase
 *  or with the control off). A title naming non-UI work ("Mechanical Design Engineer") or an
 *  internship names none: the same guard as the scorer (tracks/designRoleGuard.ts). */
function relatedPass(rule: IncludeRule, title: string): RelatedTitle[] {
  if (!hasRelatedTitles(rule) || ruleOf(rule).related === false) return [];
  if (!relatedTitleOk(title)) return [];
  const t = normalizeForPhrase(title);
  return RELATED_TITLES.filter(
    (h, i) => relatedIsOn(rule, h.id) && RELATED_RES[i].some((re) => re.test(t)),
  );
}

/** True when the title or description (whichever the rule searches) says one of its phrases, or
 *  a related title that is on names the title. No terms: true. */
export function passesInclude(rule: IncludeRule, title: string, text = ''): boolean {
  const res = regexesOf(ruleOf(rule).terms);
  if (!res.length) return true;
  const f = includeFields(rule);
  const fields = [f.title ? normalizeForPhrase(title) : '', f.text ? normalizeForPhrase(text) : ''];
  if (res.some((re) => fields.some((t) => t && re.test(t)))) return true;
  return relatedPass(rule, title).length > 0;
}

/** Per related title, how many postings it lets in (or would, when off): those that pass with
 *  its chip on and not with it off. */
export function relatedCounts(
  postings: { title: string; text: string }[],
  rule: IncludeRule,
): Record<string, number> {
  const out = Object.fromEntries(RELATED_TITLES.map((r) => [r.id, 0]));
  if (!hasRelatedTitles(rule) || Array.isArray(rule)) return out;
  for (const h of RELATED_TITLES) {
    const on = { ...rule, related: true, relatedOff: [] };
    const off = { ...on, relatedOff: [h.id] };
    out[h.id] = postings.filter(
      (p) => passesInclude(on, p.title, p.text) && !passesInclude(off, p.title, p.text),
    ).length;
  }
  return out;
}

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
