// Dedupe v2 (#576 item 9): one key for "the same role", whichever source listed it (a company
// board, HN, Remotive, We Work Remotely, designsystems.jobs, an aggregator). Pure, `.ts`
// specifiers, no app imports: shared by the browser's Feed (feed/match.ts) and the server sync
// (score.ts `dedupe`). Not the Skip fingerprint (score.ts `fingerprint`), which `decided` stores
// and which stays as it was so no saved Skip is lost.

// Legal suffixes at the END of the name only (#670): "Co Design" and "AB Tasty" keep their first
// word. A run of them goes ("Acme Holdings Ltd"); a name that is nothing but one keeps it ("The Co").
const COMPANY_SUFFIX =
  /(?:\s+(?:inc|incorporated|llc|l\.l\.c|ltd|limited|gmbh|ag|sa|sas|srl|bv|b\.v|plc|corp|corporation|co|company|pty|oy|ab|as|aps|kk|pvt|holdings?)\.?)+\s*$/;

/** A company name for comparing: case, punctuation, a leading "The" and legal suffixes (Inc,
 *  LLC, Ltd, GmbH…) go; "Acme, Inc." and "The Acme Company" are both "acme". */
export function normCompany(s: string): string {
  const out = s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/^\s*the\s+/, '')
    .replace(COMPANY_SUFFIX, ' ')
    .replace(/[.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return out || s.toLowerCase().trim();
}

// Common title abbreviations, spelled out. Seniority words are kept: Senior and Staff differ.
const ABBREV: [RegExp, string][] = [
  [/\bsr\b/g, 'senior'],
  [/\bjr\b/g, 'junior'],
  [/\bsnr\b/g, 'senior'],
  [/\bprin\b/g, 'principal'],
  [/\beng\b/g, 'engineer'],
  [/\bengr\b/g, 'engineer'],
  [/\bdev\b/g, 'developer'],
  [/\bmgr\b/g, 'manager'],
  [/\bmngr\b/g, 'manager'],
  [/\bdir\b/g, 'director'],
  [/\bvp\b/g, 'vice president'],
  [/\bux\s+ui\b|\bui\s+ux\b/g, 'ui ux'],
  [/\bfe\b/g, 'front end'],
  [/\bfrontend\b/g, 'front end'],
  [/\bds\b/g, 'design systems'],
  [/\bdesign system\b/g, 'design systems'],
  [/\bii\b/g, '2'],
  [/\biii\b/g, '3'],
  [/\biv\b/g, '4'],
];

/** A title for comparing: case, punctuation and spacing go, common abbreviations are spelled out
 *  (Sr → Senior, Eng → Engineer), seniority and level words stay. */
export function normTitle(s: string): string {
  let out = ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const [re, to] of ABBREV) out = out.replace(re, to);
  return out.replace(/\s+/g, ' ').trim();
}

/** The same role at the same company. Empty when the company is unknown: no merge on a title
 *  alone. */
export function roleKey(p: { company: string; title: string }): string {
  const c = normCompany(p.company ?? '');
  if (!c.trim() || !p.title?.trim()) return '';
  return `${c}::${normTitle(p.title)}`;
}

/** Which copy of a role to keep: a company board (apply link + description) over a curated feed
 *  over an aggregator over a remote board / HN post. Lower wins; unknown sources last. */
const RANK: Record<string, number> = {
  greenhouse: 0,
  lever: 0,
  ashby: 0,
  workable: 0,
  recruitee: 0,
  smartrecruiters: 0,
  teamtailor: 0,
  personio: 0,
  bamboohr: 0,
  rippling: 0,
  gem: 0,
  pinpoint: 0,
  breezy: 0,
  rss: 1,
  dsjobs: 1,
  manual: 1,
  ids: 1,
  adzuna: 2,
  jsearch: 2,
  theirstack: 2,
  jooble: 2,
  remotive: 3,
  arbeitnow: 3,
  remoteok: 3,
  wwr: 3,
  jobicy: 3,
  workingnomads: 3,
  himalayas: 3,
  authenticjobs: 3,
  hn: 3,
  mastodon: 4,
  bluesky: 4,
  reddit: 4,
};
export const sourceRank = (source: string): number => RANK[source] ?? 5;

const normPlace = (s: string | undefined) =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** One item per role: the best source's copy (`sourceRank`), ties to the earliest in `items`.
 *  Across sources a role collapses whatever the place says (HN's "Remote (US)" and the board's
 *  "Remote - US"); within the best source, copies in different places stay (one company's req in
 *  New York and another in London), the same place collapses (HN's monthly re-post). Items with no
 *  role key are all kept, and the order of `items` is kept. */
export function dedupeRoles<T extends { company: string; title: string; location?: string }>(
  items: readonly T[],
  sourceOf: (t: T) => string,
): T[] {
  const bestRank = new Map<string, number>();
  for (const it of items) {
    const k = roleKey(it);
    if (!k) continue;
    const r = sourceRank(sourceOf(it));
    if (!bestRank.has(k) || r < (bestRank.get(k) as number)) bestRank.set(k, r);
  }
  const taken = new Map<string, string>();
  return items.filter((it) => {
    const k = roleKey(it);
    if (!k) return true;
    const src = sourceOf(it);
    if (sourceRank(src) !== bestRank.get(k)) return false;
    const at = `${k}|${normPlace(it.location)}`;
    const first = taken.get(k);
    if (first !== undefined && first !== src) return false;
    if (taken.has(at)) return false;
    taken.set(k, src);
    taken.set(at, src);
    return true;
  });
}
