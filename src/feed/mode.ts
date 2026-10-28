// Work mode from a location line. Its own module, with no app imports, so the board parsers
// (sources/*.ts) load in the sync edge function and the dry-run script too.
import type { JobMode } from '../types.ts';

/** Work mode from a short location-ish string. Only a single unambiguous mode counts — "ONSITE or
 *  REMOTE" says nothing. Call it on a location line, never a whole description (which mentions
 *  "remote" in a dozen unrelated ways). */
export function inferMode(s: string): JobMode | undefined {
  const found: JobMode[] = [];
  if (/\bremote\b/i.test(s)) found.push('remote');
  if (/\bhybrid\b/i.test(s)) found.push('hybrid');
  if (/\bon[- ]?site\b|\bin[- ]office\b/i.test(s)) found.push('onsite');
  return found.length === 1 ? found[0] : undefined;
}
