// Screening model, in one pure place (issue #60). Fixed/universal dimensions live here as
// constants; the personal ones (blockers) are a DEFAULT vocabulary users extend with free tags.
// DOM-free so it's a deterministic test surface (mirrors jobState.ts / jobSort.ts).
import type { Job, JobMode, Verdict } from './types';

export const VERDICTS: { value: Verdict; label: string; tone: 'success' | 'warning' | 'danger' }[] =
  [
    { value: 'match', label: 'Strong fit', tone: 'success' },
    { value: 'stretch', label: 'Stretch', tone: 'warning' },
    { value: 'reach', label: 'Reach', tone: 'danger' },
  ];

export const MODES: { value: JobMode; label: string }[] = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
];

/** Rank for the "Best fit" sort — lower sorts first; unset sinks last. */
export const VERDICT_RANK: Record<Verdict, number> = { match: 0, stretch: 1, reach: 2 };

export const verdictTone = (v: Verdict): 'success' | 'warning' | 'danger' =>
  VERDICTS.find((x) => x.value === v)!.tone;

/** The one wording for a fit, wherever it shows: Live rows, the Pipeline, the job page. */
export const verdictLabel = (v: Verdict): string => VERDICTS.find((x) => x.value === v)!.label;

export const modeLabel = (m: JobMode): string => MODES.find((x) => x.value === m)!.label;

/** A dealbreaker. `soft` blockers only downgrade a match to a stretch; hard ones make it a reach
 *  (the deck's rule). Users add their own tags too — unknown tags are treated as hard. */
export interface BlockerDef {
  id: string;
  label: string;
  soft?: boolean;
}
export const DEFAULT_BLOCKERS: BlockerDef[] = [
  { id: 'sql', label: 'SQL required' },
  { id: 'coding_loop', label: 'Coding interview' },
  { id: 'titled_years', label: '3+ titled years', soft: true },
  { id: 'clearance', label: 'Active clearance' },
  { id: 'degree', label: 'Degree required' },
  { id: 'cert', label: 'Cert required', soft: true },
];
const SOFT = new Set(DEFAULT_BLOCKERS.filter((b) => b.soft).map((b) => b.id));
const BLOCKER_BY_ID = new Map(DEFAULT_BLOCKERS.map((b) => [b.id, b]));

/** Human label for a blocker id — a known default, else the raw custom tag. */
export const blockerLabel = (id: string): string => BLOCKER_BY_ID.get(id)?.label ?? id;

/** Suggested verdict from the deck's rule: no blockers → match; only soft blockers
 *  (titled_years / cert) → stretch; any hard or custom blocker → reach. Pure, so the JD
 *  screener (#61) and the detail-panel editor can both call it. */
export function suggestVerdict(blockers: readonly string[]): Verdict {
  if (!blockers.length) return 'match';
  return blockers.every((b) => SOFT.has(b)) ? 'stretch' : 'reach';
}

const MODE_VALUES = new Set<string>(MODES.map((m) => m.value));
const VERDICT_VALUES = new Set<string>(VERDICTS.map((v) => v.value));

/** Coerce the additive screening fields on read — drop anything malformed rather than migrate
 *  (old records simply lack these). Idempotent; leaves every other field untouched. */
export function normalizeScreening(job: Job): Job {
  const out: Job = { ...job };
  if (out.mode !== undefined && !MODE_VALUES.has(out.mode)) delete out.mode;
  if (out.verdict !== undefined && !VERDICT_VALUES.has(out.verdict)) delete out.verdict;
  if (typeof out.applicants !== 'number' || !isFinite(out.applicants) || out.applicants < 0)
    delete out.applicants;
  if (typeof out.travelPct !== 'number' || !isFinite(out.travelPct)) delete out.travelPct;
  if (Array.isArray(out.blockers)) {
    const cleaned = out.blockers
      .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
      .map((b) => b.trim());
    if (cleaned.length) out.blockers = Array.from(new Set(cleaned));
    else delete out.blockers;
  } else {
    delete out.blockers;
  }
  if (typeof out.angle === 'string' && out.angle.trim()) out.angle = out.angle.trim();
  else delete out.angle;
  if (typeof out.screenedAt !== 'string') delete out.screenedAt;
  return out;
}
