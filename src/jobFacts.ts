// The facts the job page's Overview lists (#130): only those the job has, as term / description
// pairs. Pure and DOM-free; the page renders them with HDS MetadataList.
import { deriveJobState } from './jobState';
import { hostOf } from './store';
import type { Job } from './types';

export interface Fact {
  term: string;
  description: string;
}

const ago = (d: number) => (d <= 0 ? 'today' : `${d}d ago`);

export function jobFacts(job: Job, now: Date = new Date()): Fact[] {
  const s = deriveJobState(job, now);
  const facts: Fact[] = [];
  const add = (term: string, description?: string | null) => {
    if (description) facts.push({ term, description });
  };
  add('Company', job.company);
  add('Location', job.location);
  add('Pay', job.salary);
  add('Source', hostOf(job.url));
  add('Contact', job.contact);
  add('Seniority', job.seniority);
  add('Résumé', job.resume);
  add('Applied', s.appliedDaysAgo != null ? ago(s.appliedDaysAgo) : null);
  if (!job.archived) {
    if (s.followUp.due) add('Follow-up', 'Due now');
    else if (s.followUp.daysUntil != null) add('Follow-up', `In ${s.followUp.daysUntil}d`);
  }
  add('Saved with', job.note);
  add('Notes', job.notes);
  add('Last follow-up', s.followUp.loggedDaysAgo != null ? ago(s.followUp.loggedDaysAgo) : null);
  return facts;
}

export function researchLinks(label: string): [string, string][] {
  const q = encodeURIComponent(label || '');
  return [
    ['Glassdoor', `https://www.glassdoor.com/Search/results.htm?keyword=${q}`],
    ['LinkedIn', `https://www.linkedin.com/search/results/companies/?keywords=${q}`],
    ['levels.fyi', `https://www.levels.fyi/?search=${q}`],
    ['Google', `https://www.google.com/search?q=${q}+careers+reviews`],
  ];
}
