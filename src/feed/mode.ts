// Work mode from a location line. Its own module, with no app imports, so the board parsers
// (sources/*.ts) load in the sync edge function and the dry-run script too.
import type { JobMode } from '../types.ts';

/** Work mode from a short location-ish string. Only a single unambiguous mode counts — "ONSITE or
 *  REMOTE" says nothing. Call it on a location line, never a whole description (which mentions
 *  "remote" in a dozen unrelated ways). */
/** A line that rules remote out ("No remote", "Not remote", "Non-remote", "remote not
 *  available") says nothing in favour of remote (#624). */
const REMOTE_NEGATED =
  /\b(?:no|not|non)[- ]?remote\b|\bremote(?: work)? (?:is )?(?:not|n't) (?:available|possible|allowed|offered|an option)\b/gi;

/** The text with every phrase ruling remote out taken away. */
export const withoutNegatedRemote = (s: string): string => s.replace(REMOTE_NEGATED, ' ');

/** Whether the text offers remote: the word, outside a phrase that rules it out. */
export const mentionsRemote = (s: string): boolean => /\bremote\b/i.test(withoutNegatedRemote(s));

export function inferMode(s: string): JobMode | undefined {
  const found: JobMode[] = [];
  if (mentionsRemote(s)) found.push('remote');
  if (/\bhybrid\b/i.test(s)) found.push('hybrid');
  if (/\bon[- ]?site\b|\bin[- ]office\b/i.test(s)) found.push('onsite');
  return found.length === 1 ? found[0] : undefined;
}

// A place that names no city: a remote posting's usual location line, without the word.
const PLACE_UNSTATED =
  /^(anywhere|worldwide|global|earth|united states( of america)?|usa?|u\.s\.?a?\.?|north america|americas|europe|emea|apac|latam|canada|uk|united kingdom)$/i;

/** Remote only (Adrian 2026-10-28), on the source's own work mode or the location line
 *  (`inferMode`): remote keeps; on-site or hybrid drops; no mode and no city keeps, marked
 *  'unstated'. Shared by the browser's auto-scan (autoScan.ts `remoteOnly`) and the server's scan
 *  rotation (src/tracks/rotation.ts). */
export function remoteVerdict(
  mode: JobMode | undefined,
  location: string,
): 'keep' | 'unstated' | 'drop' {
  const m = mode ?? inferMode(location);
  if (m === 'remote') return 'keep';
  if (m) return 'drop';
  const place = location.trim().replace(/[.,;]+$/, '');
  return !place || PLACE_UNSTATED.test(place) ? 'unstated' : 'drop';
}
