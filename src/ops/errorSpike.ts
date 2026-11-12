// Client error spike check (#598): did crash reports (client_errors, #47) jump in the hour after a
// production deploy? Pure: scripts/error-spike.ts reads the deploys from GitHub and the counts
// from Supabase, then asks these two functions. No app code imports this file.

export const HOUR_MS = 60 * 60 * 1000;
/** The window after a deploy that is compared. */
export const AFTER_MS = HOUR_MS;
/** The baseline: the 7 days before the deploy, as reports per hour. */
export const BASELINE_MS = 7 * 24 * HOUR_MS;
/** A jump is at least this many reports in the hour after... */
export const MIN_AFTER = 5;
/** ...and at least this many times the baseline's hourly rate. */
export const FACTOR = 3;

export interface Deploy {
  sha: string;
  /** When the deploy went live (its first `success` status). */
  readyAt: string;
}

export interface Verdict {
  spike: boolean;
  after: number;
  baselinePerHour: number;
  /** One plain line for the log and the alert. */
  line: string;
}

/**
 * The deploys whose hour after has ended since the last run: ready between
 * `now - AFTER_MS - lookbackMs` and `now - AFTER_MS`. The cron runs hourly with a longer look
 * back, so a deploy can be picked twice; the alert dedupes by sha.
 */
export function deploysToCheck(deploys: Deploy[], now: number, lookbackMs: number): Deploy[] {
  const end = now - AFTER_MS;
  const start = end - lookbackMs;
  return deploys.filter((d) => {
    const t = Date.parse(d.readyAt);
    return Number.isFinite(t) && t > start && t <= end;
  });
}

/** Compare the hour after with the baseline's hourly rate. */
export function spikeVerdict(after: number, baseline: number, baselineMs = BASELINE_MS): Verdict {
  const baselinePerHour = baseline / (baselineMs / HOUR_MS);
  const spike = after >= MIN_AFTER && after >= FACTOR * baselinePerHour;
  const rate = baselinePerHour.toFixed(2);
  const line = spike
    ? `Spike: ${after} reports in the hour after the deploy, baseline ${rate} an hour.`
    : `No spike: ${after} reports in the hour after the deploy, baseline ${rate} an hour.`;
  return { spike, after, baselinePerHour, line };
}

/** The first `success` status's time, or null while the deploy never went live. */
export function readyAtOf(statuses: { state: string; created_at: string }[]): string | null {
  const ok = statuses
    .filter((s) => s.state === 'success')
    .map((s) => s.created_at)
    .sort();
  return ok[0] ?? null;
}

/** The alert's title; the sha in it is the dedupe key. */
export const alertTitle = (sha: string) => `Client errors jumped after deploy ${sha.slice(0, 7)}`;
