// Rules-based JD screener (issue #61) — paste a job description, get suggested screening fields
// (mode, travel, blockers, verdict). NO AI: the deck's screener rules (§10.3) are almost entirely
// deterministic keyword matches, so this delivers ~80% of the value at zero API cost while the app
// removes its AI (#54). Pure + DOM-free → table-driven tests. The screener SUGGESTS; the user edits.
//
// Only the DEFAULT blocker vocabulary is auto-detected (per the grilled decision); custom user tags
// stay manual. An optional authed AI upgrade (#40) can come later if these rules prove too blunt.
import { suggestVerdict } from './screening';
import type { JobMode, Verdict } from './types';

export const MAX_JD = 40000;

export interface JdHit {
  tag: string;
  evidence: string;
}
export interface JdScreen {
  mode?: JobMode;
  travelPct?: number;
  blockers: string[];
  verdict: Verdict;
  hits: JdHit[];
}

const firstMatch = (re: RegExp, t: string): string | null => {
  const m = re.exec(t);
  return m ? m[0].trim().replace(/\s+/g, ' ') : null;
};

// ---- blocker detectors (each returns the matched snippet as evidence, or null) ----

function detectSql(t: string): string | null {
  // \bsql\b won't match inside PostgreSQL/MySQL/NoSQL (no word boundary), which is what we want.
  return (
    firstMatch(/\b(t-?sql|pl\/?sql|sql)\b/i, t) ??
    firstMatch(/\boracle\b[^.]{0,15}\b(quer|sql)/i, t)
  );
}

function detectCodingLoop(t: string): string | null {
  // Solutions/Sales Engineer titles hide coding rounds; explicit coding assessments count.
  // Config exercises, mock discovery calls, and Excel/data tasks are NOT coding_loop.
  return (
    firstMatch(/\b(solutions?|sales)\s+engineer\b/i, t) ??
    firstMatch(
      /\b(coding (assessment|challenge|exercise|test|interview)|live[- ]?coding|take[- ]?home (code|coding|assignment)|leetcode|hackerrank|codesignal|whiteboard(ing)?|algorithms?)\b/i,
      t,
    )
  );
}

function detectClearance(t: string): string | null {
  // Only ACTIVE clearance requirements (per the deck) — a "current/active" or "required" signal.
  return (
    firstMatch(/\b(active|current)\b[^.]{0,30}\bclearance\b/i, t) ??
    firstMatch(/\bclearance\b[^.]{0,25}\b(required|must)\b/i, t)
  );
}

function detectTitledYears(t: string): string | null {
  // 3+ years specifically in implementation / onboarding / professional services / customer success.
  // "X years OR <home services|trades|construction|insurance|field service> experience" does NOT count.
  const roles = 'implementation|onboarding|professional services|customer success';
  const patterns = [
    new RegExp(`\\b(\\d+)\\+?\\s*(?:or more\\s*)?years?\\b[\\s\\S]{0,50}?\\b(?:${roles})\\b`, 'gi'),
    new RegExp(`\\b(?:${roles})\\b[\\s\\S]{0,50}?\\b(\\d+)\\+?\\s*years?`, 'gi'),
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const years = parseInt(m[1], 10);
      if (!(years >= 3)) continue;
      const window = t.slice(Math.max(0, m.index - 25), m.index + m[0].length + 45);
      if (
        /\bor\b[\s\S]{0,45}\b(home services|trades|construction|insurance|field service)\b/i.test(
          window,
        )
      )
        continue; // industry-OR escape hatch
      return m[0].trim().replace(/\s+/g, ' ');
    }
  }
  return null;
}

function detectDegree(t: string): string | null {
  const m =
    /\b(bachelor'?s?|master'?s?|b\.?s\.?|b\.?a\.?|degree)\b[^.]{0,30}\b(required|require)\b/i.exec(
      t,
    ) ?? /\brequires?\b[^.]{0,30}\b(bachelor'?s?|master'?s?|degree)\b/i.exec(t);
  if (!m) return null;
  const window = t.slice(Math.max(0, m.index - 10), m.index + m[0].length + 30);
  if (/\b(or equivalent|preferred|a plus|nice to have)\b/i.test(window)) return null;
  return m[0].trim().replace(/\s+/g, ' ');
}

function detectCert(t: string): string | null {
  const m =
    /\b(certification|certificate|certified)\b[^.]{0,30}\b(required|must)\b/i.exec(t) ??
    /\brequires?\b[^.]{0,30}\b(certification|certificate)\b/i.exec(t);
  if (!m) return null;
  const window = t.slice(Math.max(0, m.index - 10), m.index + m[0].length + 30);
  if (/\b(preferred|a plus|nice to have)\b/i.test(window)) return null;
  return m[0].trim().replace(/\s+/g, ' ');
}

const BLOCKER_RULES: { tag: string; detect: (t: string) => string | null }[] = [
  { tag: 'sql', detect: detectSql },
  { tag: 'coding_loop', detect: detectCodingLoop },
  { tag: 'titled_years', detect: detectTitledYears },
  { tag: 'clearance', detect: detectClearance },
  { tag: 'degree', detect: detectDegree },
  { tag: 'cert', detect: detectCert },
];

function detectMode(t: string): { mode?: JobMode; evidence?: string } {
  const hybrid =
    firstMatch(/\bhybrid\b/i, t) ??
    firstMatch(/\b\d\s*days?\s*(?:per week|a week|in[- ](?:the[- ])?office|on-?site)\b/i, t);
  if (hybrid) return { mode: 'hybrid', evidence: hybrid };
  const onsite = firstMatch(
    /\b(on-?site|in-office|in the office|in-person|on premises?|relocat\w*)\b/i,
    t,
  );
  if (onsite) return { mode: 'onsite', evidence: onsite };
  const remote = firstMatch(
    /\b(fully remote|100% remote|remote-first|work from home|wfh|remote)\b/i,
    t,
  );
  if (remote) return { mode: 'remote', evidence: remote };
  return {};
}

function detectTravel(t: string): number | null {
  const m =
    /\b(?:up to\s*)?(\d{1,3})\s*%\s*travel\b/i.exec(t) ??
    /\btravel\b[^.]{0,15}?(\d{1,3})\s*%/i.exec(t);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/** Screen a job description into suggested fields. Empty input → an empty (match) screen. */
export function screenJd(raw: string): JdScreen {
  const t = (raw || '').slice(0, MAX_JD);
  const hits: JdHit[] = [];
  const blockers: string[] = [];
  for (const r of BLOCKER_RULES) {
    const ev = r.detect(t);
    if (ev) {
      blockers.push(r.tag);
      hits.push({ tag: r.tag, evidence: ev });
    }
  }
  const { mode, evidence: modeEv } = detectMode(t);
  if (mode && modeEv) hits.push({ tag: `mode:${mode}`, evidence: modeEv });
  const travel = detectTravel(t);
  const travelPct = travel ?? undefined;
  if (travelPct != null) hits.push({ tag: 'travel', evidence: `${travelPct}% travel` });
  return { mode, travelPct, blockers, verdict: suggestVerdict(blockers), hits };
}
