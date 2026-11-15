// The sign-in screen's two lines (redesign §5.8, #555), the benefit first. The Account menu's
// signed-out group is short (Adrian's phone test, 2026-11-12): a label with the benefit, then the
// key "Sign in". One benefit line for both (Adrian 2026-11-15): the screen and the menu say the same.
export const SIGN_IN_BENEFIT = 'Sign in to sync your jobs across devices.';
export const SIGN_IN_HOW = 'We email you a sign-in link. No password needed.';
/** The Account menu's signed-out header (2026-11-15): where the data is, as the primary line, then
 *  the benefit line as its caption, as the email and "Synced" are signed in. */
export const SIGN_IN_STATE = 'On this device only';
/** The Account menu's signed-out key. */
export const SIGN_IN_ITEM = 'Sign in';
/** The two lines' box: the form step's description. */
export const SIGN_IN_COPY_ID = 'rjb-signin-copy';
/** The one legal line on the sign-in screen (Adrian 2026-11-13, after Tailscale's login page). */
export const SIGN_IN_AGREE = {
  before: (name: string) => `By signing in, you agree to ${name}’s `,
  terms: 'Terms of use',
  and: ' and ',
  privacy: 'Privacy policy',
  after: '.',
};
