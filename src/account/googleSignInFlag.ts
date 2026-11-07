// Whether the sign-in screen offers "Continue with Google" (#482). OFF until Adrian has turned on
// the Google provider in Supabase (Auth → Providers → Google, with its Google Cloud OAuth client and
// the redirect allow-list): with the provider off, the button led to Supabase's
// `{"code":400,"msg":"Unsupported provider: provider is not enabled"}` page (2026-11-07). The
// magic link is the way in until then. To turn it on, set GOOGLE_SIGN_IN_ON to true. The suites
// that test the Google flow turn it on with setGoogleSignIn. No imports, so it costs the entry
// nothing.
const GOOGLE_SIGN_IN_ON = false;

let enabled = GOOGLE_SIGN_IN_ON;

/** Tests only: show or hide the Google button. */
export function setGoogleSignIn(on: boolean): void {
  enabled = on;
}

/** Reset to the shipped default (test setup). */
export function resetGoogleSignIn(): void {
  enabled = GOOGLE_SIGN_IN_ON;
}

export const googleSignInEnabled = (): boolean => enabled;
