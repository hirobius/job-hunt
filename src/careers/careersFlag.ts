// The flag for the career preferences preview (ADR 0011, proposed): off unless this device sets
// `rjb_ui_careers_preview` to "1" in localStorage. A device pref, never synced. While it is off the
// Search profile dialog is the design-systems form, as before.
export const CAREERS_FLAG_KEY = 'rjb_ui_careers_preview';

export function careersPreviewOn(): boolean {
  try {
    return localStorage.getItem(CAREERS_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}
