export type Status = 'Saved' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected';

export const STATUSES: Status[] = ['Saved', 'Applied', 'Interviewing', 'Offer', 'Rejected'];

/** How good a fit this job is — a fixed 3-point self-assessment (distinct from Status, which
 *  tracks pipeline stage). See docs: the "Implementation Track" deck §10.1 + issue #60. */
export type Verdict = 'match' | 'stretch' | 'reach';

/** Work mode. Kept fixed/universal; the competition signal (remote ≈ 5× applicants) hangs off it. */
export type JobMode = 'remote' | 'hybrid' | 'onsite';

/** A single per-role checklist item. */
export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

export interface Job {
  url: string;
  label: string;
  status: Status;
  applied?: string;
  followUp?: string;
  note?: string;
  contact?: string;
  resume?: string;
  salary?: string;
  company?: string;
  location?: string;
  seniority?: string;
  priority?: boolean;
  archived?: boolean;
  todos?: Todo[]; // per-role checklist (additive; old records read as [])
  notes?: string; // per-role free-form notes (additive; old records read as '')
  // --- Screening fields (additive; issue #60). Normalized on read (src/screening.ts); old
  //     records simply lack them. `blockers` holds default-vocab ids or custom user tags. ---
  verdict?: Verdict;
  mode?: JobMode;
  travelPct?: number;
  applicants?: number; // self-entered at apply time — a real competition metric
  blockers?: string[]; // dealbreaker tags (default vocab + custom)
  angle?: string; // positioning note for THIS job
  screenedAt?: string; // ISO — set when the JD screener (#61) last ran
}
