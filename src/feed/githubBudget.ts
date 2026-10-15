// GitHub's keyless REST API allows 10 search requests a minute and 60 core requests an hour per IP.
// Method 3 (docs/specs/discovery-methods.md) stays well inside that: a budget of 8 searches a minute
// and 40 core calls an hour, kept in local storage (`rjb_gh_budget`) so a reload cannot spend it
// twice, plus a "blocked until" time when GitHub itself says to wait. No token, ever.
import { browserKv, type KeyValue } from './fetchFeed';

export const GH_BUDGET_KEY = 'rjb_gh_budget';
export const SEARCH_PER_MINUTE = 8;
export const CORE_PER_HOUR = 40;
const MINUTE = 60_000;
const HOUR = 3_600_000;

export type GhKind = 'search' | 'core';
export type Reserve = { ok: true } | { ok: false; until: number };

interface State {
  search: number[];
  core: number[];
  blockedUntil?: number;
}

export interface GithubBudget {
  /** Spend one call of `kind`, or say when it is next available. */
  reserve(kind: GhKind): Reserve;
  /** GitHub asked us to wait: nothing is spent before `untilMs`. */
  blockUntil(untilMs: number): void;
  /** When GitHub's own limit lifts, if it is in force. */
  blockedUntil(): number | undefined;
}

const nums = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];

export function createGithubBudget({
  kv = browserKv(),
  now = Date.now,
}: { kv?: KeyValue; now?: () => number } = {}): GithubBudget {
  const read = (): State => {
    let v: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(kv.get(GH_BUDGET_KEY) ?? '{}');
      if (parsed && typeof parsed === 'object') v = parsed as Record<string, unknown>;
    } catch {
      /* a corrupt record is an empty one */
    }
    const t = now();
    return {
      search: nums(v.search).filter((at) => t - at < MINUTE),
      core: nums(v.core).filter((at) => t - at < HOUR),
      blockedUntil:
        typeof v.blockedUntil === 'number' && v.blockedUntil > t ? v.blockedUntil : undefined,
    };
  };
  const write = (s: State) => kv.set(GH_BUDGET_KEY, JSON.stringify(s));

  return {
    reserve(kind) {
      const s = read();
      if (s.blockedUntil) return { ok: false, until: s.blockedUntil };
      const list = s[kind];
      const max = kind === 'search' ? SEARCH_PER_MINUTE : CORE_PER_HOUR;
      const span = kind === 'search' ? MINUTE : HOUR;
      if (list.length >= max) return { ok: false, until: list[0] + span };
      list.push(now());
      write(s);
      return { ok: true };
    },
    blockUntil(untilMs) {
      const s = read();
      write({ ...s, blockedUntil: Math.max(untilMs, s.blockedUntil ?? 0) });
    },
    blockedUntil: () => read().blockedUntil,
  };
}
