// Search targeting: narrow the ranked postings by what the user does NOT want. Pure and applied
// after the fetch, so it costs no requests. Each rule counts what it hid, so the panel can say why
// a list got shorter. Salary comes only from sources that state it (never parsed from free text),
// and a posting with no stated pay is kept unless the user asks for pay to be shown.
import type { Seniority } from '../curation/types';
import { termRegex } from './match';
import { passesInclude, type IncludeRule } from './mustInclude';
import type { RankedPosting } from './types';

export interface Targeting {
  /** Words or phrases; a posting that mentions any in its title or body is hidden. */
  exclude: string[];
  seniority: Seniority;
  /** Yearly, in dollars. Hides postings whose top pay is below it. */
  salaryFloor?: number;
  /** Also hide postings that state no pay. */
  salaryOnly: boolean;
  /** The track's title filter (#223): ticked titles lead; an unticked one hides a posting whose
   * title names it and no ticked one. Titles only, never the body. */
  titles?: { on: string[]; off: string[] };
  /** Must include (2026-10-23): a posting is listed only when the fields the rule searches (title,
   * description) say one of its phrases ("design system", never "system design"). Empty: no rule. */
  include?: IncludeRule;
}

export const NO_TARGETING: Targeting = { exclude: [], seniority: 'any', salaryOnly: false };

export interface HiddenCounts {
  include: number;
  exclude: number;
  seniority: number;
  salary: number;
  titles: number;
}

export type TitleLevel = 'junior' | 'mid' | 'senior';

const SENIOR_RE = /\b(?:senior|sr|staff|principal|lead|director|head of|vp|vice president)\b/i;
const JUNIOR_RE = /\b(?:intern(?:ship)?|junior|jr|entry[- ]level|entry|apprentice)\b/i;

/** A title's level, from its words only. Whole words: "Leader" is not "Lead", "Internal" not "Intern". */
export function titleLevel(title: string): TitleLevel {
  if (SENIOR_RE.test(title)) return 'senior';
  if (JUNIOR_RE.test(title)) return 'junior';
  return 'mid';
}

/** "Exclusion" terms as regexes (the same phrase rules as the search term). */
function excludeRegexes(terms: string[]): RegExp[] {
  return terms.map((t) => termRegex(t)).filter((r): r is RegExp => r !== null);
}

const usd = (p: RankedPosting) => !p.currency || p.currency.toUpperCase() === 'USD';

export function applyTargeting<P extends RankedPosting>(
  postings: P[],
  t: Targeting,
): { postings: P[]; hidden: HiddenCounts } {
  const hidden: HiddenCounts = { include: 0, exclude: 0, seniority: 0, salary: 0, titles: 0 };
  const include = t.include ?? [];
  const hasInclude = (Array.isArray(include) ? include : include.terms).some((x) => x.trim());
  const excludes = excludeRegexes(t.exclude);
  const onRes = excludeRegexes(t.titles?.on ?? []);
  const offRes = excludeRegexes(t.titles?.off ?? []);
  const ticked = (p: P) => onRes.some((re) => re.test(p.title));
  const kept = postings.filter((p) => {
    if (hasInclude && !passesInclude(include, p.title, p.text)) {
      hidden.include++;
      return false;
    }
    if (offRes.some((re) => re.test(p.title)) && !ticked(p)) {
      hidden.titles++;
      return false;
    }
    if (excludes.some((re) => re.test(p.title) || re.test(p.text))) {
      hidden.exclude++;
      return false;
    }
    if (t.seniority !== 'any') {
      const level = titleLevel(p.title);
      if (t.seniority === 'entry' ? level === 'senior' : level === 'junior') {
        hidden.seniority++;
        return false;
      }
    }
    const top = p.salaryMax ?? p.salaryMin;
    const stated = top !== undefined && usd(p);
    if (stated || (top === undefined && !t.salaryOnly)) {
      // Pay is stated in dollars (check the floor), or not stated and that is allowed.
      if (stated && t.salaryFloor !== undefined && top < t.salaryFloor) {
        hidden.salary++;
        return false;
      }
      return true;
    }
    // A figure in another currency can't be compared to a dollar floor: kept, like unstated pay,
    // unless the user wants only stated pay (it is stated, so it passes that too).
    if (top !== undefined) return true;
    hidden.salary++;
    return false;
  });
  // Ticked titles lead; each half keeps its ranked order.
  const ordered = onRes.length ? [...kept.filter(ticked), ...kept.filter((p) => !ticked(p))] : kept;
  return { postings: ordered, hidden };
}
