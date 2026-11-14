// The words for Scan details: what the Feed left out and why a source didn't answer. Kept out of
// scanDetails.ts (the store), which the entry imports.

/** What the Feed left out, as phrases. */
export function hiddenParts(h: {
  saved: number;
  decided: number;
  muted: number;
  include: number;
  exclude: number;
  seniority: number;
  salary: number;
}): string[] {
  return [
    h.saved > 0 && `${h.saved} saved`,
    h.decided > 0 && `${h.decided} skipped`,
    h.muted > 0 && `${h.muted} from muted companies`,
    h.include > 0 && `${h.include} not design-system roles`,
    h.seniority > 0 && `${h.seniority} by level`,
    h.exclude > 0 && `${h.exclude} by words left out`,
    h.salary > 0 && `${h.salary} by pay`,
  ].filter((x): x is string => !!x);
}

/** Why one source didn't answer, in plain words. Remotive's spent daily budget says when it comes back. */
export function unavailableWhy(s: { label: string; error?: string }): string {
  return s.error?.includes('daily limit reached')
    ? `${s.label.split(' · ')[0]}: today's free searches are used up, more tomorrow.`
    : (s.error?.replace(/ — /g, ': ') ?? `${s.label} didn’t answer.`);
}
