// Section (group) labels as shown. The starter packs once named their featured section "Apply Now";
// that Title Case label is synced in older accounts' `groups` rows, so it is shown in sentence case
// here rather than rewritten in the database. Every other label stays exactly as the user wrote it.
const APPLY_NOW = 'apply now';

export function displayGroupLabel(label: string): string {
  return label.trim().toLowerCase() === APPLY_NOW ? 'Apply now' : label;
}

/** Two labels name the same section when they differ only in case or spacing at the ends. */
export function sameGroupLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
