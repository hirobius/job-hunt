// Back where you signed in from (return paths, Adrian 2026-10-22). A magic link opens the app at its
// root (authRedirect.ts: no path or hash can ride along), so the page you asked for the link on is
// kept here, on this device, and the tab the link opens goes there once the sign-in lands. It
// expires after a day, and it is only used by a tab that opened from a sign-in link.
import { buildHash, getRoute, isAuthCallback, navigate, parseHash } from '../route';
import { openedFromAuthLink } from '../authFragment';

const KEY = 'rjb_signin_return';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** This tab opened from a sign-in link (read at load, before authFragment strips the tokens). */
export const openedFromSignInLink = openedFromAuthLink;

/** Remember the page a sign-in link is being sent from. */
export function rememberSignInReturn(now = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ hash: buildHash(getRoute()), at: now }));
  } catch {
    /* storage blocked: the link still signs in, on Companies */
  }
}

/** The remembered page (once: it is cleared), or null when there is none or it is stale. */
export function takeSignInReturn(now = Date.now()): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const { hash, at } = JSON.parse(raw) as { hash?: unknown; at?: unknown };
    if (typeof hash !== 'string' || typeof at !== 'number' || now - at > MAX_AGE_MS) return null;
    const r = parseHash(hash);
    return r.tab && !isAuthCallback(r) ? buildHash(r) : null;
  } catch {
    return null;
  }
}

/** After a sign-in from a link: go (in place) to the page the link was asked for on. */
export function returnAfterSignIn(fromLink = openedFromSignInLink): void {
  if (!fromLink) return;
  const hash = takeSignInReturn();
  if (!hash) return;
  const r = parseHash(hash);
  navigate({ ...r, from: r.from ?? null, section: r.section ?? null }, true);
}
