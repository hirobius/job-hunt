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
  rateLimit: 'Too many sign-in emails were sent. Try again later; this can take up to an hour.',
  offline: "Couldn't connect. Check your connection and try again.",
  other: "Couldn't send the link. Try again in a minute.",
  // The CAPTCHA (#278; only when a site key is set, captchaKey.ts). The same button tries again.
  captchaBlocked:
    "The check that you are a person didn't load. Turn off any content blocker for this site, then try again.",
  captchaClosed: 'The check was closed before it finished. Try again.',
  captchaExpired: 'The check took too long. Try again.',
  captchaFailed: "The check that you are a person didn't pass. Try again.",
} as const;

/** Why the CAPTCHA gave no token (hcaptcha.ts `CaptchaFailure`), in plain words. */
export function captchaErrorMessage(
  failure: 'blocked' | 'closed' | 'expired' | 'network' | 'failed',
): string {
  if (failure === 'blocked') return SIGN_IN_ERRORS.captchaBlocked;
  if (failure === 'closed') return SIGN_IN_ERRORS.captchaClosed;
  if (failure === 'expired') return SIGN_IN_ERRORS.captchaExpired;
  if (failure === 'network') return SIGN_IN_ERRORS.offline;
  return SIGN_IN_ERRORS.captchaFailed;
}

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
  // Supabase refused the token, or wanted one and got none (`captcha_failed`).
  if (code === 'captcha_failed' || /captcha/.test(msg)) return SIGN_IN_ERRORS.captchaFailed;
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
