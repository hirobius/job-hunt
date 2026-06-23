// Tiny persistence for the candidate "skills profile" used by the AI features.
// Kept separate so the intake dialog and the future résumé tailorer can share it.
// localStorage only — this never leaves the browser except as part of an extract
// request the user explicitly triggers.
const KEY = 'rjb_ai_skills';

export function loadSkills(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveSkills(value: string): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* ignore quota / unavailable storage */
  }
}
