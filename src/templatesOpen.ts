// The Apply view's Templates open or closed (Adrian 2026-11-08): a device UI pref (rjb_ui_*), kept
// across visits, closed by default.
const KEY = 'rjb_ui_templates_open';

let openByDefault = false;
/** Tests: most suites test what is inside Templates, so they start with it open. */
export const setTemplatesOpenByDefault = (v: boolean) => {
  openByDefault = v;
};

export function readTemplatesOpen(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? openByDefault : v === '1';
  } catch {
    return openByDefault;
  }
}

export function writeTemplatesOpen(v: boolean): void {
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* private mode: open for this visit only */
  }
}
