// The sign-in screen opens on its own once a tab session, over a signed-out Review (#755):
// "Continue without an account" closes it and leaves the visitor on Review's sign-in line, and a
// later visit to the tab, or a reload in the same tab, does not open it again. Kept in
// sessionStorage; with storage blocked, once a page load.
const KEY = 'rjb_sign_in_asked';
let asked = false;

/** True the first time only, in a tab session. */
export function firstSignInAsk(): boolean {
  try {
    if (sessionStorage.getItem(KEY)) return false;
    sessionStorage.setItem(KEY, '1');
    return true;
  } catch {
    if (asked) return false;
    asked = true;
    return true;
  }
}

/** Tests: a new tab session. */
export function resetSignInAsk(): void {
  asked = false;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}
