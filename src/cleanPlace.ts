import { placeText } from './feed/placeText';

// A source's placeholder for "no location" ("N/A", "TBD", "-") is no location (Adrian 2026-11-04:
// Stripe's Greenhouse board answers "N/A", and the Pipeline showed it beside the map pin).
const PLACEHOLDER =
  /^(n\/?a|none|null|undefined|tbd|tba|unknown|not specified|not stated|-+|—|\.+)$/i;

/** The location, trimmed to its place (never a run-in description, placeText); '' when it is
 *  empty or a placeholder. */
export function cleanPlace(s: unknown): string {
  const t = typeof s === 'string' ? placeText(s) : '';
  return PLACEHOLDER.test(t) ? '' : t;
}
