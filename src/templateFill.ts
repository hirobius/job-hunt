import type { Job } from './types';

export const TEMPLATE_TOKENS = ['Company', 'Role', 'Contact', 'Angle'] as const;

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

/** Fill any `[Variable]` from values keyed by its lower-case name; unset ones stay visible (#221). */
export function fillVariables(body: string, values: Record<string, string | undefined>): string {
  return body.replace(/\[([^[\]\n]{1,40})\]/g, (m, name: string) => {
    const v = values[name.trim().toLowerCase()]?.trim();
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
  const out: Resolved = {};
  for (const n of names) {
    const key = n.toLowerCase();
    const j = fromJob[key]?.trim();
    const t = templateValues?.[key]?.trim();
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
