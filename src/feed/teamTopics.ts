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

const RULES: { match: RegExp; search: TeamSearch }[] = [
  {
    match:
      /\bdesign[- ]?systems?\b|\bdesign[- ]?tokens?\b|\btoken architect|\bcomponent librar|\bdesign (engineer|technologist|infrastructure)|\bui platform\b/i,
    search: DESIGN_SYSTEM_SEARCH,
  },
  {
    match: /\bservicenow\b/i,
    search: { noun: 'ServiceNow', queries: [['servicenow']] },
  },
];

/** The team search for a track's terms (titles and ATS roles), or null when none of them names a
 *  technology GitHub tags. The first matching rule wins: one search per track keeps the budget. */
export function teamSearchFor(terms: string[]): TeamSearch | null {
  const text = terms.join(' | ');
  return RULES.find((r) => r.match.test(text))?.search ?? null;
}
