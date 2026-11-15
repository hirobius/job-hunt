// The account this device last synced with (Adrian's phone, 2026-11-15). Sign-out wipes the
// sync base with the rest of this device's data, so without this the next sign-in to the SAME
// account saw "no base + data here" and asked "Add this device's … to …?" every time. This key
// keeps only the account's id (never an email), survives sign-out's wipe, and lets that same
// account come back without the ask. Any other account still gets the ask (login injection
// guard), and Delete my data drops it with the account.
const KEY = 'rjb_device_account';

/** The id of the account this device last synced with, or null. */
export function readDeviceAccount(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Note the account that passed the sign-in path on this device. */
export function writeDeviceAccount(uid: string) {
  try {
    localStorage.setItem(KEY, uid);
  } catch {
    /* storage blocked: the next sign-in asks again, the safe side */
  }
}

/** Forget it (Delete my data: the account is gone). */
export function clearDeviceAccount() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Keys sign-out's wipe keeps. */
export const KEPT_ON_SIGN_OUT = ['rjb_color_mode', KEY];
