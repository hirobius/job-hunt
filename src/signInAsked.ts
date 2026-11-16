// The sign-in screen opens on its own once a page load, over a signed-out Review (#755):
// "Continue without an account" closes it and leaves the visitor on Review's sign-in line, and a
// later visit to the tab in the same page load does not open it again.
let asked = false;

/** True the first time only, in a page load. */
export function firstSignInAsk(): boolean {
  if (asked) return false;
  asked = true;
  return true;
}

/** Tests: a new page load. */
export function resetSignInAsk(): void {
  asked = false;
}
