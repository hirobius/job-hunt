// The must-include check (mustInclude.ts holds the rule, its store and the phrase matcher): a
// posting is listed when its title or description (whichever the rule searches) says one of the
// rule's phrases, or a related title that is on names its title. Its own module (2026-11-11), so the
// design engineer guard (tracks/designRoleGuard.ts, shared with the scorer and the keyless feeds)
// stays out of the entry chunk: only the Feed, the auto-scan and the scorer's forTrack call it.
import { relatedTitleOk, uiDesignEngineerTitle } from '../tracks/designRoleGuard';
import {
  BODY_SIGNALS_TO_LIST,
  designSystemsTrack,
  PRODUCT_DESIGN_TITLE,
} from '../tracks/track-config';
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
 *  internship names none: the same guard as the scorer (tracks/designRoleGuard.ts). A design
 *  engineer title names its related title only with a UI word in it (Adrian 2026-11-17); a plain
 *  one is let in by its description instead (`bodyConfirms`). */
function namesRelated(rule: IncludeRule, title: string): RelatedTitle[] {
  if (!hasRelatedTitles(rule) || ruleOf(rule).related === false) return [];
  if (!relatedTitleOk(title)) return [];
  const t = normalizeForPhrase(title);
  return RELATED_TITLES.filter(
    (h, i) => relatedIsOn(rule, h.id) && RELATED_RES[i].some((re) => re.test(t)),
  );
}

function relatedPass(rule: IncludeRule, title: string): RelatedTitle[] {
  return namesRelated(rule, title).filter(
    (h) => h.id !== DESIGN_ENGINEER_ID || uiDesignEngineerTitle(title),
  );
}

const DESIGN_ENGINEER_ID = 'Design Engineer';

const PRODUCT_DESIGN_RE = new RegExp(PRODUCT_DESIGN_TITLE, 'i');
const SIGNAL_RES = designSystemsTrack.descriptionSignals.map((d) => new RegExp(d.pattern, 'i'));

/** A product-design title on a design system rule (Adrian 2026-11-15), or a plain design engineer
 *  title while that related title is on (Adrian 2026-11-17): one the description can let in. The
 *  same guard as the related titles (no internship, no hardware sense). The phone's light read
 *  asks this to know which descriptions to fetch. */
export function bodyCanConfirm(rule: IncludeRule, title: string): boolean {
  if (!hasRelatedTitles(rule) || !relatedTitleOk(title)) return false;
  return (
    PRODUCT_DESIGN_RE.test(title) ||
    namesRelated(rule, title).some((h) => h.id === DESIGN_ENGINEER_ID)
  );
}

/** The description confirms design-systems work for such a title: it shows at least
 *  `BODY_SIGNALS_TO_LIST` of the scorer's body signals (design system, component library, design
 *  tokens, Storybook…), the bar the server's scorer queues an adjacent title at. One mention of
 *  "design system" alone is not enough: most product design postings have one. */
export function bodyConfirms(rule: IncludeRule, title: string, text: string): boolean {
  if (!text || !bodyCanConfirm(rule, title)) return false;
  let hits = 0;
  for (const re of SIGNAL_RES) if (re.test(text) && ++hits >= BODY_SIGNALS_TO_LIST) return true;
  return false;
}

/** True when the title or description (whichever the rule searches) says one of its phrases, a
 *  related title that is on names the title, or (a design system rule) the title is a
 *  product-design one and the description confirms design-systems work. No terms: true. */
export function passesInclude(rule: IncludeRule, title: string, text = ''): boolean {
  const res = regexesOf(ruleOf(rule).terms);
  if (!res.length) return true;
  const f = includeFields(rule);
  const fields = [f.title ? normalizeForPhrase(title) : '', f.text ? normalizeForPhrase(text) : ''];
  if (res.some((re) => fields.some((t) => t && re.test(t)))) return true;
  if (relatedPass(rule, title).length > 0) return true;
  return bodyConfirms(rule, title, text);
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
