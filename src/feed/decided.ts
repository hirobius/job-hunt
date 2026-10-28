// Decided (CONTEXT.md, simplify spec): the verdicts on Postings, kept by posting fingerprint
// (`tracks/score.ts` fingerprint: company + title), never by company, so a skipped posting never
// comes back to Review. It replaced the server's `skips` table (Simplify 6/9, #387): the blob is
// the one source of truth. Blob v12 (#384) carries it as `decided[]`; until then it lives in this
// browser only (`rjb_decided`). The newest MAX entries are kept.
import { createStore } from '../createStore';
import { loadPersisted, savePersisted } from '../persisted';

export type DecidedVerdict = 'skip' | 'save';

export interface Decision {
  fingerprint: string;
  verdict: DecidedVerdict;
  /** ISO time it was decided. */
  at: string;
}

const KEY = 'rjb_decided';
export const MAX_DECIDED = 2000;

export function sanitizeDecided(v: unknown): Decision[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: Decision[] = [];
  for (const raw of v) {
    const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    const fingerprint = typeof o.fingerprint === 'string' ? o.fingerprint : '';
    const verdict = o.verdict === 'skip' || o.verdict === 'save' ? o.verdict : null;
    if (!fingerprint || !verdict || seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push({ fingerprint, verdict, at: typeof o.at === 'string' ? o.at : '' });
  }
  return out.slice(-MAX_DECIDED);
}

const decided = createStore<Decision[]>(sanitizeDecided(loadPersisted<unknown>(KEY, [])), {
  onSet: (next) => savePersisted(KEY, next),
});

export const useDecided = decided.use;
export const getDecided = decided.get;

/** Record a verdict (a later one replaces an earlier one for the same posting). */
export function decide(fingerprint: string, verdict: DecidedVerdict, now = new Date()): void {
  if (!fingerprint) return;
  const rest = decided.get().filter((d) => d.fingerprint !== fingerprint);
  decided.set([...rest, { fingerprint, verdict, at: now.toISOString() }].slice(-MAX_DECIDED));
}

/** Undo: forget the verdict on one posting. */
export function undecide(fingerprint: string): void {
  decided.set(decided.get().filter((d) => d.fingerprint !== fingerprint));
}

/** The fingerprints skipped. */
export const skippedSet = (all: Decision[]) =>
  new Set(all.filter((d) => d.verdict === 'skip').map((d) => d.fingerprint));

/** Tests: start empty. */
export function resetDecided(): void {
  decided.set([]);
}
