// Two-letter monogram for a job's company (falls back to the source host, then the title), used as
// the avatar medallion on Tracker rows so a list of saved roles scans by company at a glance.
export function monogram(company?: string, host?: string, title?: string): string {
  const src = (company || '').trim() || (host || '').replace(/^www\./, '').split('.')[0] || (title || '').trim();
  const words = src.split(/[\s\-_/]+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Stable accent hue per monogram so the same company always gets the same tint (21st.dev-style
// avatar lists). Returns a 0–359 hue.
export function monogramHue(seed: string): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
