// Role Radar's demand patterns (docs/specs/role-radar.md, `demand-patterns`): across a scan, how
// many postings ask for each thing, split into what the user's evidence covers and what is thin —
// the research's "~21/26 ask for X" roll-up, recomputed on every scan.
import { asksFor, asksIn, fitGap, type Evidence } from './fitGap';
import type { Posting } from '../feed/types';

export interface Demand {
  label: string;
  count: number;
}

export interface Patterns {
  total: number;
  covered: Demand[];
  thin: Demand[];
}

export function demandPatterns(postings: Posting[], evidence: Evidence[]): Patterns {
  const asks = asksFor(evidence);
  const counts = new Map<
    string,
    { label: string; count: number; covered: boolean; order: number }
  >();
  for (const p of postings) {
    const covered = new Set(fitGap(p, evidence).fit.map((f) => f.ask.id));
    for (const a of asksIn(p, asks)) {
      const c = counts.get(a.id) ?? {
        label: a.label,
        count: 0,
        covered: covered.has(a.id),
        order: asks.indexOf(a),
      };
      c.count++;
      counts.set(a.id, c);
    }
  }
  const sorted = [...counts.values()].sort((x, y) => y.count - x.count || x.order - y.order);
  const pick = (covered: boolean) =>
    sorted.filter((c) => c.covered === covered).map(({ label, count }) => ({ label, count }));
  return { total: postings.length, covered: pick(true), thin: pick(false) };
}
