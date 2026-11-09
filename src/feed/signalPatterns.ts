// The two signal patterns the Feed reads in a posting's text (match.ts `detectSignals`), in a
// module with no imports, so the sync edge function can load them too: it keeps a window of text
// around every hit when it trims a stored description (tracks/matchText.ts, #499).

/** Open to non-full-time engagement: the consulting / fractional opening. */
export const CONTRACT_RE = /\b(contract|1099|freelance(?:rs?)?|fractional|part[- ]time)\b/gi;

/** Building it from zero — the team needs the thing made, not a maintainer of one. Role words, not
 *  a company's age: "founding engineer" counts, "since our founding in 2015" does not. */
export const FOUNDING_RE = new RegExp(
  [
    String.raw`\bfounding\s+(?:[a-z-]+\s+){0,2}?(?:engineer|designer|developer|hire|member|team|role|lead)s?\b`,
    String.raw`\bfirst(?:-ever)?\s+(?:dedicated\s+|full[- ]time\s+|in[- ]house\s+)?(?:[a-z-]+\s+){0,2}?(?:engineer|designer|developer|hire|owner|lead|person|role)\b`,
    String.raw`\bbuild\s+(?:our|the|a)\s+(?:[a-z-]+\s+){0,2}?(?:design[- ]system|component[- ]library)\s+from\s+scratch\b`,
  ].join('|'),
  'i',
);
