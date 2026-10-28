// What a route is called where a Back names it (return paths, Adrian 2026-10-22): "← Senior UX
// Designer", "← Apply mode (2 of 3)", "← Companies". Pure over the saved jobs and documents, with a
// hook that reads them live.
import { useMemo } from 'react';
import { COMPANY_TAB, type Route } from './route';
import { findJobById, useJobs } from './store';
import { titleOf } from './jobRow';
import { applySequence } from './applyQueue';
import { companyBySlug } from './companies';
import { DOCUMENT_KINDS, useDocuments, type Document } from './documents';
import { legalDocFor } from './legal';
import type { Job } from './types';

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The name of the page a route shows. */
export function routeLabel(r: Route, ctx: { jobs: Job[]; docs: Document[] }): string {
  switch (r.tab) {
    case 'queue': {
      if (!r.jobId) return 'Pipeline';
      const job = findJobById(r.jobId, ctx.jobs);
      return job ? titleOf(job) : 'Job';
    }
    case 'apply': {
      const job = r.sub ? findJobById(r.sub, ctx.jobs) : undefined;
      if (!job) return 'Apply mode';
      const seq = applySequence(ctx.jobs, job);
      const at = seq.findIndex((j) => j.url === job.url);
      return at < 0 ? 'Apply mode' : `Apply mode (${at + 1} of ${seq.length})`;
    }
    case COMPANY_TAB:
      return (r.sub && companyBySlug(r.sub, ctx.jobs, ctx.docs)?.name) || 'Company';
    case 'discover':
      if (r.sub === 'live') return 'Live postings';
      if (r.sub === 'review') return 'Review new';
      if (r.sub === 'boards') return 'Check a list';
      return 'Companies';
    case 'copy-deck': {
      if (!r.sub) return 'Documents';
      if (r.sub.startsWith('new/')) {
        const kind = DOCUMENT_KINDS.find((k) => k.kind === r.sub!.slice(4));
        return kind ? `New ${lower(kind.label)}` : 'New document';
      }
      const doc = ctx.docs.find((d) => d.id === decode(r.sub!));
      return doc ? doc.title || 'Untitled' : 'Document';
    }
    case 'legal':
      return legalDocFor(r.sub).title;
    case '':
      return 'Companies';
    default:
      return 'the last page';
  }
}

/** The live name of a route (re-renders when the jobs or documents it names change). */
export function useRouteLabel(r: Route): string {
  const jobs = useJobs();
  const docs = useDocuments();
  return useMemo(() => routeLabel(r, { jobs, docs }), [r, jobs, docs]);
}
