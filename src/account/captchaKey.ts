// The sign-in CAPTCHA's switch (#278): hCaptcha's PUBLIC site key, read at build time from
// `VITE_HCAPTCHA_SITEKEY` (Vercel → Environment Variables). Unset or empty, the sign-in screen is
// as it was: no script, no token, no extra line. A site key is public by design (it is in every
// page that shows the check); the SECRET goes only into the Supabase dashboard, never here.
// No imports, so it costs a chunk nothing. Steps: docs/sign-in-email-and-captcha.md.

/** hCaptcha site keys are UUIDs; its secrets are not. */
const SITE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Why a build-time value cannot be the site key, or null (unset and empty are fine: off). The
 *  build stops on a problem (vite.config.ts), so a secret pasted into the public variable by
 *  mistake never ships in the bundle. */
export function siteKeyProblem(raw: string | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v || SITE_KEY.test(v)) return null;
  return 'VITE_HCAPTCHA_SITEKEY is not an hCaptcha site key (a UUID). If the secret was pasted here, remove it and rotate it: this variable is public.';
}

const read = (): string => {
  const v = (import.meta.env.VITE_HCAPTCHA_SITEKEY ?? '').trim();
  return SITE_KEY.test(v) ? v : '';
};

// Read on first use, not at import: vite.config.ts imports this file for the check above.
let siteKey: string | null = null;

/** The site key, or '' when the CAPTCHA is off. */
export const captchaSiteKey = (): string => (siteKey ??= read());

/** Tests only: turn the CAPTCHA on with a key, or off with ''. */
export function setCaptchaSiteKey(key: string): void {
  siteKey = key;
}
