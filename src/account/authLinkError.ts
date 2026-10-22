// A sign-in link that is expired, already used or otherwise refused comes back as
// `#error=…&error_code=…&error_description=…` (Supabase, implicit flow). That is not a route: the
// shell says what happened in plain words and moves to Companies through the route seam (App.tsx).

export const EXPIRED_LINK_MSG = 'That sign-in link has expired. Send a new one from Account.';
export const FAILED_LINK_MSG = "That sign-in link didn't work. Send a new one from Account.";

/** The plain message for a sign-in link's error hash, or null when the hash is no such error. */
export function authLinkErrorMessage(hash: string): string | null {
  const p = new URLSearchParams(hash.replace(/^#\/?/, ''));
  const error = p.get('error');
  if (!error) return null;
  const detail = `${p.get('error_code') ?? ''} ${p.get('error_description') ?? ''}`;
  // Supabase sends otp_expired for an expired or already-used link ("invalid or has expired").
  return /expired|invalid/i.test(detail) ? EXPIRED_LINK_MSG : FAILED_LINK_MSG;
}
