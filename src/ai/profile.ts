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

// Full résumé text, used by the tailorer. Same localStorage-only contract.
const RESUME_KEY = 'rjb_resume';

export function loadResume(): string {
  try {
    return localStorage.getItem(RESUME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveResume(value: string): void {
  try {
    localStorage.setItem(RESUME_KEY, value);
  } catch {
    /* ignore quota / unavailable storage */
  }
}
