// Which GitHub topics a track's own terms point at, for the Teams tool's team search
// (src/feed/dsOrgs.ts). GitHub topics name technologies, so only a track whose terms mention one gets
// a search: a design-systems track looks for `design-system` repositories, a ServiceNow track for
// `servicenow` ones. A trades or consulting track gets none, and Discover then opens on Apply now
// instead of a tool that would mostly say "no public board" (PR #217 review).

export interface TeamSearch {
  /** "design-system" in "Find design-system teams". */
  noun: string;
  /** Topic queries, narrowest first; the topics in one query are ANDed by GitHub. */
  queries: string[][];
}

export const DESIGN_SYSTEM_SEARCH: TeamSearch = {
  noun: 'design-system',
  queries: [['design-system', 'design-tokens'], ['design-system']],
};

/** Terms that only ever mean design-systems work. */
const DESIGN_SYSTEM_TERM =
  /\bdesign[- ]?systems?\b|\bdesign[- ]?tokens?\b|\btoken architect|\bcomponent librar|\bui platform\b/i;

/** "Design engineer" and its kin: a design-systems title in software, but a CAD title in a fab shop
 *  or an engineering firm ("Mechanical design engineer", "Sheet metal design engineer"). */
const DESIGN_ROLE = /\bdesign (engineer|technologist|infrastructure)/i;
/** What may stand before a software design role: seniority, a UI word, nothing else. */
const SOFTWARE_LEAD =
  /^(?:(?:staff|senior|sr\.?|lead|principal|junior|jr\.?|founding|head of|ui|ux|front[- ]?end|web|software|product)[\s,/-]*)*$/i;
/** A physical discipline anywhere in the track (its terms or its label) rules the software reading
 *  out. */
const PHYSICAL =
  /\b(mechanical|hardware|cad|solidworks|autocad|revit|sheet[- ]?metal|structural|civil|electrical|electronics?|industrial|manufacturing|mechatronics?|piping|hvac|plumbing|automotive|aerospace|fabricat\w*|weld\w*|machin(?:ing|ist)\w*|cnc|pcb|trades|construction)\b/i;

/** True when the track uses "design engineer" (or technologist, infrastructure) in its software
 *  sense: unqualified or qualified only by seniority or a UI word, in a track whose terms and label
 *  name no physical discipline ("Design engineer" on a "Mechanical engineering" track is CAD). */
function softwareDesignRole(terms: string[], label: string): boolean {
  if ([...terms, label].some((t) => PHYSICAL.test(t))) return false;
  return terms.some((t) => {
    const m = DESIGN_ROLE.exec(t);
    return !!m && SOFTWARE_LEAD.test(t.slice(0, m.index).trim());
  });
}

const RULES: { match: (terms: string[], label: string) => boolean; search: TeamSearch }[] = [
  {
    match: (terms, label) =>
      terms.some((t) => DESIGN_SYSTEM_TERM.test(t)) || softwareDesignRole(terms, label),
    search: DESIGN_SYSTEM_SEARCH,
  },
  {
    match: (terms) => terms.some((t) => /\bservicenow\b/i.test(t)),
    search: { noun: 'ServiceNow', queries: [['servicenow']] },
  },
];

/** The team search for a track's terms (titles and ATS roles), or null when none of them names a
 *  technology GitHub tags. The track's label only rules a reading out (a physical discipline makes
 *  "design engineer" CAD); it never brings a search in. The first matching rule wins: one search
 *  per track keeps the budget. */
export function teamSearchFor(terms: string[], label = ''): TeamSearch | null {
  return RULES.find((r) => r.match(terms, label))?.search ?? null;
}
