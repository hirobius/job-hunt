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
