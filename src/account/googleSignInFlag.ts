// Whether the sign-in screen offers "Continue with Google" (#482). ON since 2026-11-12, when the
// Google provider was turned on in Supabase (Auth → Providers → Google). Before that it was off: with
// the provider off, the button led to Supabase's "Unsupported provider" 400 page (2026-11-07). To
// hide it again, set GOOGLE_SIGN_IN_ON to false. Tests follow this default; the suite for the hidden
// state turns it off with setGoogleSignIn(false). No imports, so it costs the entry nothing.
const GOOGLE_SIGN_IN_ON = true;

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
