// A source's placeholder for "no location" ("N/A", "TBD", "-") is no location (Adrian 2026-11-04:
// Stripe's Greenhouse board answers "N/A", and the Pipeline showed it beside the map pin).
const PLACEHOLDER =
  /^(n\/?a|none|null|undefined|tbd|tba|unknown|not specified|not stated|-+|—|\.+)$/i;

/** The location, trimmed; '' when it is empty or a placeholder. */
export function cleanPlace(s: unknown): string {
  const t = typeof s === 'string' ? s.trim() : '';
  return PLACEHOLDER.test(t) ? '' : t;
}
