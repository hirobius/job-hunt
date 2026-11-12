// Work mode from a location line. Its own module, with no app imports, so the board parsers
// (sources/*.ts) load in the sync edge function and the dry-run script too.
//
// One remote classifier (#576 item 10): `classifyRemote` is the rule behind every remote test,
// browser and server alike: `inferMode` (every source parser), `remoteVerdict` (the auto-scan's and
// the scan rotation's remote only), `isRemoteJob` (Apply's Remote only, pipelineView.ts) and the
// server's keyed feeds (tracks/feeds). Call it on a location line or a title, never a whole
// description (which mentions "remote" in a dozen unrelated ways).
import type { JobMode } from '../types.ts';

export type RemoteClass = 'remote' | 'hybrid' | 'onsite' | 'unstated';

export interface RemoteClassification {
  /** The one mode the text states; 'unstated' when it states none or more than one. */
  mode: RemoteClass;
  /** Remote is offered somewhere in the text, outside a phrase ruling it out ("Portland, OR, or
   *  Remote within Canada", "Remote or hybrid"). */
  offersRemote: boolean;
  /** A region limit on the remote offer: "Remote (US only)" → "US", "Remote - EMEA" → "EMEA". */
  region?: string;
}

/** A line that rules remote out ("No remote", "Not remote", "Non-remote", "remote not
 *  available") says nothing in favour of remote (#624). */
const REMOTE_NEGATED =
  /\b(?:no|not|non)[- ]?remote\b|\bremote(?: work)? (?:is )?(?:not|n't) (?:available|possible|allowed|offered|an option)\b/gi;

/** The text with every phrase ruling remote out taken away. */
export const withoutNegatedRemote = (s: string): string => s.replace(REMOTE_NEGATED, ' ');

// Remote and its synonyms. "Distributed" only as a way of working, never "distributed systems".
const REMOTE_WORD =
  /\bremote\b|\banywhere\b|\bwfh\b|\bwork(?:ing)? from home\b|\btelecommut\w*|\bdistributed\b(?!\s+(?:systems?|computing|databases?|tracing|storage|ledgers?|cache|caching|architecture)\b)/i;
const HYBRID_DAYS =
  /\b\d\s*(?:-\s*\d\s*)?days?\s*(?:a|per|\/)?\s*(?:week|wk)?\s*(?:in|at)\s*(?:the\s*)?office\b|\b\d\s*days?\s*(?:on[- ]?site|in[- ]office)\b/gi;
const HYBRID = /\bhybrid\b/i;
const ONSITE = /\bon[- ]?site\b|\bin[- ]office\b|\bin[- ]person\b/i;

/** Whether the text offers remote: the word or a synonym, outside a phrase that rules it out. */
export const mentionsRemote = (s: string): boolean => REMOTE_WORD.test(withoutNegatedRemote(s));

const REGION_AFTER =
  /\bremote\b\s*(?:[-–—:,(/|]\s*|\s+(?:within|in|from|across|based in)\s+(?:the\s+)?)(?:only\s+(?:in\s+)?)?([a-z][a-z .&]{0,38}?[a-z.])(?:\s+only)?\s*(?:\)|$|[,;|/])/i;
const REGION_BEFORE =
  /(?:^|[,;|(]\s*)([a-z][a-z .&]{0,30}?[a-z.])\s*[-–—]?\s*(?:\(\s*)?remote\b\s*\)?\s*$/i;
// Words that look like a region but say nothing of where.
const NOT_REGION =
  /^(?:first|friendly|ok|okay|possible|available|work|working|position|role|job|optional|only|or|and|a|the|fully|100%)$/i;

function regionOf(s: string): string | undefined {
  const m = REGION_AFTER.exec(s) ?? REGION_BEFORE.exec(s);
  const r = m?.[1]?.trim().replace(/\.$/, '');
  if (!r || NOT_REGION.test(r) || /\b(?:hybrid|on[- ]?site|office|remote)\b/i.test(r))
    return undefined;
  return r;
}

/** The one shared remote classifier. Takes a location line (plus the title, or a source's own
 *  work-mode words) as one string. Only a single unambiguous mode counts: "ONSITE or REMOTE" is
 *  'unstated' with `offersRemote`. A phrase ruling remote out with nothing else said is on-site. */
export function classifyRemote(s: string): RemoteClassification {
  const text = withoutNegatedRemote(s);
  const negated = text !== s;
  const days = HYBRID_DAYS.test(text);
  HYBRID_DAYS.lastIndex = 0;
  const rest = text.replace(HYBRID_DAYS, ' ');
  const remote = REMOTE_WORD.test(rest);
  const found: RemoteClass[] = [];
  if (remote) found.push('remote');
  if (days || HYBRID.test(rest)) found.push('hybrid');
  if (ONSITE.test(rest)) found.push('onsite');
  if (!found.length && negated) found.push('onsite');
  const mode = found.length === 1 ? found[0] : 'unstated';
  const region = remote ? regionOf(rest.trim()) : undefined;
  return region ? { mode, offersRemote: remote, region } : { mode, offersRemote: remote };
}

export function inferMode(s: string): JobMode | undefined {
  const { mode } = classifyRemote(s);
  return mode === 'unstated' ? undefined : mode;
}

// A place that names no city: a remote posting's usual location line, without the word.
const PLACE_UNSTATED =
  /^(anywhere|worldwide|global|earth|united states( of america)?|usa?|u\.s\.?a?\.?|north america|americas|europe|emea|apac|latam|canada|uk|united kingdom)$/i;

/** Remote only (Adrian 2026-10-28), on the source's own work mode or the location line
 *  (`classifyRemote`): remote keeps; on-site or hybrid drops; no mode and no city keeps, marked
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
