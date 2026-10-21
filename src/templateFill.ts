import type { Job } from './types';

const TEMPLATE_TOKENS = ['Company', 'Role', 'Contact', 'Angle'] as const;

type Values = Partial<Record<'company' | 'role' | 'contact' | 'angle', string>>;

/** Replace [Company]/[Role]/[Contact]/[Angle] (case-insensitive) with non-empty values; anything else stays visible. */
export function fillTemplate(body: string, values: Values): string {
  return body.replace(/\[(company|role|contact|angle)\]/gi, (m, name: string) => {
    const v = values[name.toLowerCase() as keyof Values]?.trim();
    return v ? v : m;
  });
}

export const valuesFromJob = (job: Job): Values => ({
  company: job.company,
  role: job.label,
  contact: job.contact,
  angle: job.angle,
});

/** Known tokens (canonical names) still present in a filled body. */
export function unfilledTokens(text: string): string[] {
  return TEMPLATE_TOKENS.filter((t) => new RegExp(`\\[${t}\\]`, 'i').test(text));
}

/** A map's own string value for `key`, so `[constructor]` or `[__proto__]` never reads the prototype. */
export function ownValue(
  o: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!o || !Object.prototype.hasOwnProperty.call(o, key)) return undefined;
  const v = o[key];
  return typeof v === 'string' ? v : undefined;
}

/** Fill any `[Variable]` from values keyed by its lower-case name; unset ones stay visible (#221). */
export function fillVariables(body: string, values: Record<string, string | undefined>): string {
  return body.replace(/\[([^[\]\n]{1,40})\]/g, (m, name: string) => {
    const v = ownValue(values, name.trim().toLowerCase())?.trim();
    return v ? v : m;
  });
}

export type VariableSource = 'job' | 'template' | 'kit';
export type Resolved = Record<string, { value: string; source: VariableSource }>;

/**
 * Where each variable's value comes from (#221): a picked job fills its four fields; the template's
 * own values fill the rest (and what the job lacks); `[Your name]` falls back to the Application
 * kit name. Keys are lower-case names; a variable with no value is left out.
 */
export function resolveVariables(
  names: string[],
  templateValues: Record<string, string> | undefined,
  job: Job | null | undefined,
  kitName?: string,
): Resolved {
  const fromJob: Record<string, string | undefined> = job ? valuesFromJob(job) : {};
  // No prototype: a variable named `__proto__` or `constructor` is just a key.
  const out: Resolved = Object.create(null);
  for (const n of names) {
    const key = n.toLowerCase();
    const j = ownValue(fromJob, key)?.trim();
    const t = ownValue(templateValues, key)?.trim();
    const k = key === 'your name' ? kitName?.trim() : '';
    if (j) out[key] = { value: j, source: 'job' };
    else if (t) out[key] = { value: t, source: 'template' };
    else if (k) out[key] = { value: k, source: 'kit' };
  }
  return out;
}

/** A template's text filled for a job (or none): job fields, then template values, then the kit name. */
export function fillSnippet(
  snippet: { body: string; values?: Record<string, string> },
  job: Job | null | undefined,
  kitName?: string,
): string {
  const names = [...snippet.body.matchAll(/\[([^[\]\n]{1,40})\]/g)].map((m) => m[1].trim());
  const resolved = resolveVariables(names, snippet.values, job, kitName);
  return fillVariables(
    snippet.body,
    Object.fromEntries(Object.entries(resolved).map(([k, r]) => [k, r.value])),
  );
}

/**
 * A one-paragraph preview of a filled text, at most `max` characters before the ellipsis. The cut
 * lands on a word or blank boundary, never inside one, so a preview never ends in "[Your n…"
 * (slice 3, rev-3 item 4). A blank the cut would split is dropped whole.
 */
export function previewText(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  let cut = max;
  // Inside a blank: back up to its start.
  for (const m of flat.matchAll(/\[([^[\]\n]{1,40})\]/g)) {
    const start = m.index ?? 0;
    if (start < cut && start + m[0].length > cut) cut = start;
  }
  // Inside a word (the next character continues it): back up to the space before it.
  if (cut < flat.length && flat[cut] !== ' ' && flat[cut - 1] !== ' ' && flat[cut - 1] !== ']') {
    const space = flat.lastIndexOf(' ', cut - 1);
    if (space > 0) cut = space;
  }
  return `${flat.slice(0, cut).trimEnd()}…`;
}
