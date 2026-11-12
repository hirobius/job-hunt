// Followed and Ignored companies (simplify amendment 2, Q6): the small list under the Account menu
// that took the Companies tab's place. It is the Sources list, read the way Review new reads it:
// followed = every board and company it reads (watched boards, dreams, targets, follows), once by
// name, A to Z; ignored = every company muted (Ignore on a New company, Not this company). Pure.
import { companyKey } from './feed/decided';
import type { Source } from './feed/profile';

export interface CompanyEntry {
  /** companyKey of the name: what mute and unmute go by. */
  key: string;
  label: string;
  /** What the list shows: the label cleaned for display (displayName). Never stored or keyed. */
  name: string;
  /** Ignored only: a Source (board or followed company) names it, so unmuting is enough to follow
   *  it again. A company muted from a posting alone has none: Follow again follows it by name. */
  known?: boolean;
}

export interface CompaniesLists {
  followed: CompanyEntry[];
  ignored: CompanyEntry[];
}

/** Acronyms a title-cased board label spells wrong ("Bbc", "Ca Technologies", #619). */
const ACRONYMS = new Set([
  'ABB',
  'ADP',
  'AMD',
  'AWS',
  'BBC',
  'BMW',
  'CA',
  'CBS',
  'CNN',
  'EA',
  'GE',
  'HP',
  'HPE',
  'IBM',
  'ING',
  'NBC',
  'NPR',
  'PBS',
  'SAP',
  'SAS',
  'UPS',
  'USA',
  'UK',
  'US',
  'AI',
  'HBO',
  'BT',
  'JP',
]);

/** A company name as the list shows it: a trailing separator dropped ("Cambly ·"), known
 *  acronyms upper case ("Bbc" -> "BBC"). Display only: keys and stored labels never change. */
export function displayName(label: string): string {
  const trimmed = label.replace(/[\s·•|,:;\-–—/]+$/u, '').trim() || label.trim();
  return trimmed.replace(/[\p{L}]+/gu, (w) =>
    ACRONYMS.has(w.toUpperCase()) && w !== w.toLowerCase() ? w.toUpperCase() : w,
  );
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
const byLabel = (a: CompanyEntry, b: CompanyEntry) => collator.compare(a.name, b.name);

export function companiesLists(
  sources: readonly Source[],
  muted: readonly string[],
): CompaniesLists {
  const mutedNames = new Map<string, string>();
  for (const m of muted) {
    const k = companyKey(m);
    if (k && !mutedNames.has(k)) mutedNames.set(k, m.trim());
  }
  const labels = new Map<string, string>();
  const followed = new Map<string, CompanyEntry>();
  for (const s of sources) {
    if (s.kind === 'feed') continue;
    const key = companyKey(s.label);
    if (!key) continue;
    if (!labels.has(key)) labels.set(key, s.label.trim());
    if (s.muted || mutedNames.has(key) || followed.has(key)) continue;
    followed.set(key, { key, label: s.label.trim(), name: displayName(s.label) });
  }
  const ignored = [...mutedNames].map(([key, muted]) => {
    const label = labels.get(key) ?? muted;
    return { key, label, name: displayName(label), known: labels.has(key) };
  });
  return { followed: [...followed.values()].sort(byLabel), ignored: ignored.sort(byLabel) };
}
