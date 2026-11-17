// Small readers for the keyless JSON feeds whose answer shape is from their docs, not seen live
// (docs/research/job-sources-2026-11.md): each takes the first field that is there, so a renamed
// field drops a row instead of storing a wrong one. Pure, `.ts` imports for Deno.
export type O = Record<string, unknown>;
export const obj = (v: unknown): O =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {};
export const str = (v: unknown) =>
  typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';

/** The first non-empty string among `keys` (dotted paths read nested objects). */
export function pick(o: O, ...keys: string[]): string {
  for (const k of keys) {
    let v: unknown = o;
    for (const part of k.split('.')) v = obj(v)[part];
    const s = str(v);
    if (s) return s;
  }
  return '';
}

/** The answer's row list: the array itself, or the first array under one of `keys`. */
export function rowsOf(json: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(json)) return json;
  const o = obj(json);
  for (const k of keys) if (Array.isArray(o[k])) return o[k] as unknown[];
  return [];
}

/** An ISO date from an ISO string or unix seconds / milliseconds; undefined when neither. */
export function isoDate(v: string): string | undefined {
  if (!v) return undefined;
  if (/^\d{9,13}$/.test(v)) {
    const n = Number(v);
    return new Date(v.length <= 10 ? n * 1000 : n).toISOString();
  }
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}
