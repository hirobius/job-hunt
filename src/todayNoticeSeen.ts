// The one-time "Today is home" notice's per-device flag (#128), apart from its component so the
// shell can mark it seen on a first run.
const SEEN_KEY = 'rjb_ui_today_home_seen';

export function isTodayNoticeSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTodayNoticeSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage blocked: shown again next visit */
  }
}
