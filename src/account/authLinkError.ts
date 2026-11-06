// A sign-in link that is expired, already used or otherwise refused comes back as
// `#error=…&error_code=…&error_description=…` (Supabase, implicit flow). That is not a route: the
// shell says what happened in plain words and moves home through the route seam (App.tsx).
// A Google sign-in that was cancelled or refused (#482) comes back the same way, in the fragment
// or the query: when this browser started one, the words say Google, not "link".

export const EXPIRED_LINK_MSG = 'That sign-in link has expired. Send a new one from Account.';
export const FAILED_LINK_MSG = "That sign-in link didn't work. Send a new one from Account.";
export const GOOGLE_CANCELLED_MSG = 'Google sign-in was cancelled.';
export const GOOGLE_FAILED_MSG = "Google sign-in didn't work. Try again from Account.";

/** The auth error params Supabase puts in the query on a refused OAuth return. */
export const AUTH_ERROR_PARAMS = ['error', 'error_code', 'error_description'] as const;

const params = (s: string) => new URLSearchParams(s.replace(/^[#?]\/?/, ''));

/** The plain message for a sign-in error in the hash (or the query), or null when there is none.
 *  `viaGoogle`: this browser started a Google sign-in (authLink.readOAuthRequest). */
export function authLinkErrorMessage(hash: string, search = '', viaGoogle = false): string | null {
  const fromHash = params(hash);
  const p = fromHash.get('error') ? fromHash : params(search);
  const error = p.get('error');
  if (!error) return null;
  const detail = `${p.get('error_code') ?? ''} ${p.get('error_description') ?? ''}`;
  if (viaGoogle) return error === 'access_denied' ? GOOGLE_CANCELLED_MSG : GOOGLE_FAILED_MSG;
  // Supabase sends otp_expired for an expired or already-used link ("invalid or has expired").
  return /expired|invalid/i.test(detail) ? EXPIRED_LINK_MSG : FAILED_LINK_MSG;
}
