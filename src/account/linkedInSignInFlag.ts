// Whether the sign-in screen offers "Continue with LinkedIn" (Supabase's linkedin_oidc provider).
// ON since 2026-11-12, when the provider was set up in Supabase and LinkedIn's developer portal. To
// hide it, set LINKEDIN_SIGN_IN_ON to false. Tests follow this default; the hidden-state suite turns
// it off with setLinkedInSignIn(false). No imports, so it costs the entry nothing.
const LINKEDIN_SIGN_IN_ON = true;

let enabled = LINKEDIN_SIGN_IN_ON;

/** Tests only: show or hide the LinkedIn button. */
export function setLinkedInSignIn(on: boolean): void {
  enabled = on;
}

/** Reset to the shipped default (test setup). */
export function resetLinkedInSignIn(): void {
  enabled = LINKEDIN_SIGN_IN_ON;
}

export const linkedInSignInEnabled = (): boolean => enabled;
