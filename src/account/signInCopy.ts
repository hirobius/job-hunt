// The sign-in screen's two lines (redesign §5.8, #555), the benefit first. The Account menu's
// signed-out item says the same words, so both read from here.
export const SIGN_IN_BENEFIT = 'Sign in to see your jobs on any device.';
export const SIGN_IN_HOW = 'We email you a sign-in link. No password needed.';
/** The Account menu item: the same words, no full stop (a menu item, not a sentence). */
export const SIGN_IN_ITEM = SIGN_IN_BENEFIT.replace(/\.$/, '');
/** The two lines' box: the form step's description. */
export const SIGN_IN_COPY_ID = 'rjb-signin-copy';
