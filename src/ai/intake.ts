// Pure mappers from an AI-extracted job to the app's Job model. No DOM/React, so
// they're unit-testable and reusable by any AI surface (intake, future tailorer).
import type { ExtractedJob } from './extract-core';

/** A display label for the saved job: "Title — Company" (whichever parts exist). */
export function jobTitle(job: Pick<ExtractedJob, 'title' | 'company'>): string {
  const title = (job.title ?? '').trim();
  const company = (job.company ?? '').trim();
  if (title && company) return `${title} — ${company}`;
  return title || company || '';
}

/** Compose a readable Notes block from the structured extraction. Empty sections
 *  are dropped so a sparse posting doesn't leave dangling headers. */
export function composeNote(job: ExtractedJob): string {
  const out: string[] = [];

  const meta = [job.company, job.location, job.seniority]
    .map((s) => (s ?? '').trim())
    .filter(Boolean);
  if (meta.length) out.push(meta.join(' · '));

  const reqs = (job.requirements ?? []).map((s) => s.trim()).filter(Boolean);
  if (reqs.length) {
    out.push('', 'Requirements:');
    reqs.forEach((r) => out.push(`• ${r}`));
  }

  const matched = (job.matched ?? []).map((s) => s.trim()).filter(Boolean);
  if (matched.length) out.push('', `✓ Matches: ${matched.join(', ')}`);

  const gaps = (job.gaps ?? []).map((s) => s.trim()).filter(Boolean);
  if (gaps.length) out.push('', `⚠ Gaps: ${gaps.join(', ')}`);

  return out.join('\n').trim();
}
