// Crash reports (#47): when the app breaks for a real user, a scrubbed report lands in the
// Supabase table `client_errors` (supabase/migrations/20261020_client_errors.sql), so a bug can be
// found without the user writing in. No new vendor or key: it is the same Supabase project and
// public key that sync uses, and the table only accepts inserts (nobody can read it with that key).
// A report never carries personal data: no user id or email, no job text, no URL query or job id.
import { supabase } from './supabase';

export type ErrorKind = 'render' | 'error' | 'rejection';

export interface ErrorReport {
  kind: ErrorKind;
  message: string;
  stack: string | null;
  route: string;
  browser: string;
}

export const MAX_MESSAGE = 300;
export const MAX_STACK = 2000;
/** Reports sent per page load, so one crash loop can't flood the table. */
export const MAX_PER_PAGE = 5;

const EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
// Query strings and fragments can carry the quick-add link or a job id: keep only the path.
const URL_TAIL = /(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g;

// Double-quoted runs are where engines echo data (`"Acme Corp…" is not valid JSON`); single quotes
// name code (`reading 'title'`), which is what a fix needs, so those stay.
const QUOTED = /"[^"\n]*"/g;

/** Removes anything that could identify the user or their data from free text. */
export function scrubText(text: string, max: number): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(URL_TAIL, '$1')
    .replace(QUOTED, '"…"')
    .slice(0, max);
}

/** Only the top-level tab of the hash route (`#/queue/<jobId>` → `queue`). */
export function routeOf(hash: string): string {
  const tab = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return /^[a-z-]{1,30}$/.test(tab) ? tab : '';
}

/** Browser family and major version only (`Chrome 130`), never the full user-agent string. */
export function browserOf(ua: string): string {
  for (const [name, re] of [
    ['Edge', /Edg\/(\d+)/],
    ['Firefox', /Firefox\/(\d+)/],
    ['Chrome', /Chrome\/(\d+)/],
    ['Safari', /Version\/(\d+).*Safari/],
  ] as const) {
    const m = ua.match(re);
    if (m) return `${name} ${m[1]}${/Mobile/.test(ua) ? ' mobile' : ''}`;
  }
  return 'Other';
}

export function buildReport(
  kind: ErrorKind,
  error: unknown,
  where: { hash: string; userAgent: string },
): ErrorReport {
  const err = error instanceof Error ? error : null;
  const message = err ? `${err.name}: ${err.message}` : String(error);
  return {
    kind,
    message: scrubText(message, MAX_MESSAGE),
    stack: err?.stack ? scrubText(err.stack, MAX_STACK) : null,
    route: routeOf(where.hash),
    browser: browserOf(where.userAgent),
  };
}

export type SendReport = (report: ErrorReport) => PromiseLike<unknown>;

const sendToSupabase: SendReport = (report) => supabase.from('client_errors').insert(report);

/** A reporter with its own per-page budget and de-duplication. Sending never throws. */
export function createReporter(send: SendReport = sendToSupabase) {
  const seen = new Set<string>();
  return (kind: ErrorKind, error: unknown) => {
    if (seen.size >= MAX_PER_PAGE || typeof window === 'undefined') return;
    const report = buildReport(kind, error, {
      hash: window.location.hash,
      userAgent: navigator.userAgent,
    });
    const key = `${report.message}\n${report.stack?.split('\n')[1] ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    // Supabase's query builder is only a thenable, and a report must never become a second error.
    Promise.resolve()
      .then(() => send(report))
      .catch(() => undefined);
  };
}

let report: ReturnType<typeof createReporter> | null = null;

/** Reports a crash, once `installErrorReporting` has run (the live site only). */
export function reportError(kind: ErrorKind, error: unknown) {
  report?.(kind, error);
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** Turns reporting on for the live site and catches errors React never sees. Local dev, the
 *  E2E runs and the screenshot gallery serve from localhost, so they never report. */
export function installErrorReporting(send?: SendReport) {
  if (LOCAL_HOSTS.includes(window.location.hostname)) return false;
  report = createReporter(send);
  window.addEventListener('error', (e) => reportError('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason));
  return true;
}
