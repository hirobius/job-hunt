// Login injection guard (security audit, High). A link carrying someone's session tokens would
// otherwise sign this browser in to THAT account, and the first sync would push this device's
// jobs, kit and documents into it. So tokens from the URL only sign in on their own when this
// browser asked for a link to that same email in the last hour; any other link (one nobody asked
// for here, or a link opened on another device) asks first: "Sign in as x@y.com?".
import type { AuthTokens } from '../authFragment';

const REQUEST_KEY = 'rjb_signin_request';
export const REQUEST_MAX_AGE_MS = 60 * 60 * 1000;

const norm = (email: string) => email.trim().toLowerCase();

/** Note that this browser asked for a sign-in link to `email` (the tab the link opens reads it). */
export function rememberSignInRequest(email: string, now = Date.now()): void {
  try {
    localStorage.setItem(REQUEST_KEY, JSON.stringify({ email: norm(email), at: now }));
  } catch {
    /* storage blocked: the link still signs in, after the confirm */
  }
}

/** The email this browser asked a link for, while it is fresh; else null. */
export function readSignInRequest(now = Date.now()): string | null {
  try {
    const o = JSON.parse(localStorage.getItem(REQUEST_KEY) || 'null') as {
      email?: unknown;
      at?: unknown;
    } | null;
    if (!o || typeof o.email !== 'string' || typeof o.at !== 'number') return null;
    const age = now - o.at;
    return age >= 0 && age <= REQUEST_MAX_AGE_MS ? o.email : null;
  } catch {
    return null;
  }
}

export function clearSignInRequest(): void {
  try {
    localStorage.removeItem(REQUEST_KEY);
  } catch {
    /* ignore */
  }
}

/** An access token's JWT payload (unverified: for display and matching only, the server checks
 *  the token itself when the session is set). */
function tokenClaims(accessToken: string): { email?: unknown; exp?: unknown } | null {
  try {
    const part = accessToken.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      Array.from(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')))
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const o = JSON.parse(json) as unknown;
    return o && typeof o === 'object' ? (o as { email?: unknown; exp?: unknown }) : null;
  } catch {
    return null;
  }
}

/** The account email an access token names. */
export function tokenEmail(accessToken: string): string | null {
  const email = tokenClaims(accessToken)?.email;
  return typeof email === 'string' && email.includes('@') ? email : null;
}

export type LinkDecision =
  { kind: 'auto'; email: string } | { kind: 'confirm'; email: string } | { kind: 'reject' };

/** What to do with tokens a page load arrived with. A token with no expiry, or one already
 *  expired, is refused: supabase-js would swap it for the link's refresh token without checking
 *  it, so the email it names (forged, unsigned) would sign in someone else's session. A real
 *  magic link always carries a fresh token. */
export function decideAuthLink(
  tokens: AuthTokens,
  requested: string | null,
  now = Date.now(),
): LinkDecision {
  const email = tokenEmail(tokens.access_token);
  const exp = tokenClaims(tokens.access_token)?.exp;
  if (!email || typeof exp !== 'number' || exp * 1000 <= now) return { kind: 'reject' };
  return requested && norm(requested) === norm(email)
    ? { kind: 'auto', email }
    : { kind: 'confirm', email };
}

export const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && norm(a) === norm(b);
