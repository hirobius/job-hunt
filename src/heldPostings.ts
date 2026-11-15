// Review holds late postings (Adrian 2026-11-15): once the list has settled (its first read fully
// answered) or the person has started reading it (a scroll, a tap or a key), a posting that arrives
// later is held, not put in above the cards on screen (no layout jump). A "N new postings" key at
// the top of the list shows them and goes to the top. Postings of the first load show as they come.
import { useEffect, useState } from 'react';

interface Fp {
  fingerprint: string;
}

/** The rows to show and the rows held, given the fingerprints already shown (null: not holding)
 *  and the ones always shown (the selected or linked posting). */
export function splitHeld<R extends Fp>(
  rows: R[],
  known: ReadonlySet<string> | null,
  keep: readonly (string | null | undefined)[] = [],
): { shown: R[]; held: R[]; released: boolean } {
  if (!known) return { shown: rows, held: [], released: false };
  const shown: R[] = [];
  const held: R[] = [];
  for (const r of rows)
    (known.has(r.fingerprint) || keep.includes(r.fingerprint) ? shown : held).push(r);
  // Nothing on screen to push down: show them all.
  return shown.length || !held.length
    ? { shown, held, released: false }
    : { shown: rows, held: [], released: true };
}

/** Holds rows that arrive after the list settled or the person started reading it. When any of
 *  `reset` changes (by identity: the Search profile, the Sources) the person changed what the list
 *  is, and it fills as a first load again. */
export function useHeldPostings<R extends Fp>(
  rows: R[],
  {
    settled,
    keep,
    reset,
  }: { settled: boolean; keep: (string | null | undefined)[]; reset: readonly unknown[] },
): { shown: R[]; held: R[]; showHeld: () => void } {
  const [known, setKnown] = useState<ReadonlySet<string> | null>(null);
  const [reading, setReading] = useState(false);
  const [resetOf, setResetOf] = useState(reset);
  if (resetOf.length !== reset.length || resetOf.some((x, i) => x !== reset[i])) {
    setResetOf(reset);
    setKnown(null);
    setReading(false);
  }
  useEffect(() => {
    if (reading) return;
    const on = () => setReading(true);
    const opts = { capture: true, passive: true } as const;
    document.addEventListener('scroll', on, opts);
    document.addEventListener('pointerdown', on, opts);
    document.addEventListener('keydown', on, opts);
    return () => {
      document.removeEventListener('scroll', on, opts);
      document.removeEventListener('pointerdown', on, opts);
      document.removeEventListener('keydown', on, opts);
    };
  }, [reading]);
  if (!known && (settled || reading) && rows.length)
    setKnown(new Set(rows.map((r) => r.fingerprint)));
  const { shown, held, released } = splitHeld(rows, known, keep);
  // Everything shows when none of the known rows is left (splitHeld): they all count as known now.
  if (released) setKnown(new Set(rows.map((r) => r.fingerprint)));
  const showHeld = () =>
    setKnown((k) => new Set([...(k ?? []), ...rows.map((r) => r.fingerprint)]));
  return { shown, held, showHeld };
}
