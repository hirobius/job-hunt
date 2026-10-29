// Whether a profile's own terms point at design systems, for the GitHub team search
// (src/feed/dsOrgs.ts) and role ordering (roleType.ts). GitHub topics name technologies; the app's
// one topic is `design-system` (design systems only, Adrian 2026-10-29). Terms that name nothing
// it tags get no search.

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

/** "Design engineer" and its kin: a design-systems title in software, but a CAD title in an
 *  engineering firm ("Mechanical design engineer"). */
const DESIGN_ROLE = /\bdesign (engineer|technologist|infrastructure)/i;
/** What may stand before a software design role: seniority, a UI word, nothing else. */
const SOFTWARE_LEAD =
  /^(?:(?:staff|senior|sr\.?|lead|principal|junior|jr\.?|founding|head of|ui|ux|front[- ]?end|web|software|product)[\s,/-]*)*$/i;
/** A physical engineering discipline anywhere in the terms rules the software reading out. */
const PHYSICAL =
  /\b(mechanical|hardware|cad|solidworks|autocad|revit|structural|civil|electrical|electronics?|industrial|manufacturing|mechatronics?|piping|hvac|plumbing|automotive|aerospace|cnc|pcb)\b/i;

/** True when the terms use "design engineer" (or technologist, infrastructure) in its software
 *  sense: unqualified or qualified only by seniority or a UI word, with no physical discipline
 *  named ("Design engineer" beside "SolidWorks" is CAD). */
function softwareDesignRole(terms: string[]): boolean {
  if (terms.some((t) => PHYSICAL.test(t))) return false;
  return terms.some((t) => {
    const m = DESIGN_ROLE.exec(t);
    return !!m && SOFTWARE_LEAD.test(t.slice(0, m.index).trim());
  });
}

/** The team search for the terms (titles and ATS roles), or null when none of them is about
 *  design systems. */
export function teamSearchFor(terms: string[]): TeamSearch | null {
  return terms.some((t) => DESIGN_SYSTEM_TERM.test(t)) || softwareDesignRole(terms)
    ? DESIGN_SYSTEM_SEARCH
    : null;
}
