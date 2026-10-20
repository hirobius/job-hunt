// Companies (#230, epic #225): a Company is derived on read from the company names on the user's
// Jobs, plus any Document that names a company. DECISION (#230): derived, not stored. There is no
// company store and no new blob field, so a Company can never be created by hand, duplicated, or
// left behind as an empty page: it exists exactly while a Job or a Document names it. Company-level
// Notes are ordinary Documents (`kind: 'note'`, `company` set, no `jobUrl`), so every save is a
// Version and they sync with the documents in blob v10.
//
// Names match through `companyKey` (trim, case, accents, punctuation, legal suffixes such as Inc
// or LLC). Renaming a Job's company re-links its page for free; the Notes keyed to the old name
// follow through `relinkCompanyNotes` when no Job keeps that name, and otherwise stay with the
// Jobs that do. Either way they are never orphaned: a note alone still derives its Company.
import { useMemo } from 'react';
import {
  createDocument,
  getAllDocuments,
  replaceDocuments,
  useDocuments,
  type Document,
} from './documents';
import { dedupKey, getAllJobs, useJobs } from './store';
import type { Job } from './types';

export interface Company {
  /** URL-safe id: the normalized name with hyphens (`#/company/<slug>`). */
  slug: string;
  /** Display name: the first spelling seen (on a Job, else on a Document). */
  name: string;
  jobs: Job[];
  /** Documents on its Jobs, or naming it, other than its own Notes. */
  documents: Document[];
  /** Company-level Notes: note Documents naming it, on no Job. */
  notes: Document[];
}

const SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'llp',
  'lp',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'plc',
  'gmbh',
  'ag',
  'sa',
  'bv',
  'pty',
]);

/** The normalized name two spellings of one company share ('' for no name). */
export function companyKey(name: string): string {
  const words = (name || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // Dotted abbreviations (L.L.C., S.A.) collapse into one word before punctuation splits them.
    .replace(/\b(?:\p{L}\.){2,}/gu, (m) => m.replace(/\./g, ''))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  // Drop trailing legal suffixes, but never the whole name ("Inc" alone stays "inc").
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  return words.join(' ');
}

export const companySlug = (name: string) => companyKey(name).replace(/ /g, '-');

const isCompanyNote = (d: Document) => d.kind === 'note' && !d.jobUrl && !!d.company;

/** Every Company the jobs and documents name, one per normalized name, sorted by name. */
export function deriveCompanies(jobs: Job[], docs: Document[]): Company[] {
  const bySlug = new Map<string, Company>();
  const get = (name: string | undefined): Company | undefined => {
    const slug = companySlug(name ?? '');
    if (!slug) return undefined;
    let c = bySlug.get(slug);
    if (!c) {
      c = { slug, name: name!.trim(), jobs: [], documents: [], notes: [] };
      bySlug.set(slug, c);
    }
    return c;
  };
  const byJob = new Map<string, Company>();
  for (const j of jobs) {
    const c = get(j.company);
    if (!c) continue;
    c.jobs.push(j);
    byJob.set(dedupKey(j.url), c);
  }
  for (const d of docs) {
    // A job's document follows its job (its own company field may predate a rename).
    if (d.jobUrl) {
      byJob.get(dedupKey(d.jobUrl))?.documents.push(d);
      continue;
    }
    const c = get(d.company);
    if (!c) continue;
    (isCompanyNote(d) ? c.notes : c.documents).push(d);
  }
  return [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
};

/** The Company a `#/company/<slug>` route names, or undefined. */
export function companyBySlug(slug: string, jobs: Job[], docs: Document[]): Company | undefined {
  const want = companySlug(decode(slug).replace(/-/g, ' '));
  if (!want) return undefined;
  return deriveCompanies(jobs, docs).find((c) => c.slug === want);
}

/** The live Company for a slug (re-renders on job and document changes). */
export function useCompany(slug: string): Company | undefined {
  const jobs = useJobs();
  const docs = useDocuments();
  return useMemo(() => companyBySlug(slug, jobs, docs), [slug, jobs, docs]);
}

/** Add a company-level Note (its first Version). Returns the document id. */
export function addCompanyNote(company: string, text: string): string {
  return createDocument({ kind: 'note', title: 'Note', text, company });
}

/** After a Job's company changes from `oldName` to `newName`: when no Job keeps the old name, its
 *  company Notes move to the new one. Cleared names move nothing (the notes keep their own page),
 *  and job documents are left alone (they follow their job). Call with the jobs after the rename. */
export function relinkCompanyNotes(oldName: string, newName: string, jobs: Job[] = getAllJobs()) {
  const from = companyKey(oldName);
  const to = companyKey(newName);
  if (!from || !to || from === to) return;
  if (jobs.some((j) => companyKey(j.company ?? '') === from)) return;
  const all = getAllDocuments();
  const moves = (d: Document) => isCompanyNote(d) && companyKey(d.company!) === from;
  if (!all.some(moves)) return;
  replaceDocuments(all.map((d) => (moves(d) ? { ...d, company: newName.trim() } : d)));
}
