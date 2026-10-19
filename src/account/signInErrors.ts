// Plain, actionable words for a failed magic-link request. The auth service's own messages
// ("For security purposes, you can only request this after 37 seconds", "Failed to fetch") are
// not shown: they name the vendor's internals, not what to do next.

export interface AuthErrorLike {
  message?: string;
  status?: number;
  code?: string;
}

export const SIGN_IN_ERRORS = {
  empty: 'Enter an email address',
  invalid: 'Enter an email address like name@example.com',
  rateLimit: 'Too many tries. Wait a minute and try again.',
  offline: "Couldn't connect. Check your connection and try again.",
  other: "Couldn't send the link. Try again in a minute.",
} as const;

/** A light shape check only (something@something.tld); the server has the final say. */
export function emailProblem(raw: string): string | null {
  const e = raw.trim();
  if (!e) return SIGN_IN_ERRORS.empty;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return SIGN_IN_ERRORS.invalid;
  return null;
}

export function signInErrorMessage(err: AuthErrorLike): string {
  const msg = (err.message ?? '').toLowerCase();
  const code = (err.code ?? '').toLowerCase();
  if (
    err.status === 429 ||
    code.includes('rate_limit') ||
    /rate limit|security purposes|too many/.test(msg)
  )
    return SIGN_IN_ERRORS.rateLimit;
  if (code === 'email_address_invalid' || /invalid format|validate email|invalid email/.test(msg))
    return SIGN_IN_ERRORS.invalid;
  if (/failed to fetch|network|load failed|fetch failed/.test(msg)) return SIGN_IN_ERRORS.offline;
  return SIGN_IN_ERRORS.other;
}
