// A sign-in link that is expired, already used or otherwise refused comes back as
// `#error=…&error_code=…&error_description=…` (Supabase, implicit flow). That is not a route: the
// shell says what happened in plain words and moves home through the route seam (App.tsx).
// A Google sign-in that was cancelled or refused (#482) comes back with the same params in the
// QUERY (Supabase's PKCE flow puts errors there; the magic link's implicit flow, in the fragment),
// so an error in the query is worded for the provider this browser started (Google or LinkedIn,
// read from the kept PKCE record; Google when none says).

export const EXPIRED_LINK_MSG = 'That sign-in link has expired. Send a new one from Account.';
export const FAILED_LINK_MSG = "That sign-in link didn't work. Send a new one from Account.";
export const GOOGLE_CANCELLED_MSG = 'Google sign-in was cancelled.';
export const GOOGLE_FAILED_MSG = "Google sign-in didn't work. Try again from Account.";

/** The auth error params Supabase puts in the query on a refused OAuth return. */
export const AUTH_ERROR_PARAMS = ['error', 'error_code', 'error_description'] as const;

export const LINKEDIN_CANCELLED_MSG = 'LinkedIn sign-in was cancelled.';
export const LINKEDIN_FAILED_MSG = "LinkedIn sign-in didn't work. Try again from Account.";

/** Which provider the OAuth sign-in this browser started is for (a wording hint only: read from
 *  oauthPkce.ts's record, `rjb_oauth_request`, without importing that lazy chunk). */
export function pendingOAuthProvider(): 'google' | 'linkedin_oidc' {
  try {
    const o = JSON.parse(localStorage.getItem('rjb_oauth_request') || 'null') as {
      p?: unknown;
    } | null;
    return o?.p === 'linkedin_oidc' ? 'linkedin_oidc' : 'google';
  } catch {
    return 'google';
  }
}

/** The cancelled / failed words for a provider's return. */
export function oauthMessages(provider: 'google' | 'linkedin_oidc' = pendingOAuthProvider()) {
  return provider === 'linkedin_oidc'
    ? { cancelled: LINKEDIN_CANCELLED_MSG, failed: LINKEDIN_FAILED_MSG }
    : { cancelled: GOOGLE_CANCELLED_MSG, failed: GOOGLE_FAILED_MSG };
}

const params = (s: string) => new URLSearchParams(s.replace(/^[#?]\/?/, ''));

/** The plain message for a sign-in error: a magic link's in the hash, a Google sign-in's in the
 *  query; null when there is none. */
export function authLinkErrorMessage(hash: string, search = ''): string | null {
  const q = params(search).get('error');
  if (q) {
    const m = oauthMessages();
    return q === 'access_denied' ? m.cancelled : m.failed;
  }
  const p = params(hash);
  if (!p.get('error')) return null;
  const detail = `${p.get('error_code') ?? ''} ${p.get('error_description') ?? ''}`;
  // Supabase sends otp_expired for an expired or already-used link ("invalid or has expired").
  return /expired|invalid/i.test(detail) ? EXPIRED_LINK_MSG : FAILED_LINK_MSG;
}
