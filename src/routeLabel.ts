// What a route is called where a Back names it (return paths, Adrian 2026-10-22): "← Senior UX
// Designer", "← Apply", "← Find". Pure over the saved jobs and documents, with a
// hook that reads them live.
import { useMemo } from 'react';
import { APPLY_TAB, FIND_TAB, companySlugOf, redirectOf, type Route } from './route';
import { findJobById, useJobs } from './store';
import { titleOf } from './jobRow';
import { companyBySlug } from './companies';
import { DOCUMENT_KINDS, useDocuments, type Document } from './documents';
import { legalTitleFor } from './legalRoute';
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
export function routeLabel(route: Route, ctx: { jobs: Job[]; docs: Document[] }): string {
  // An old hash (#/apply/<id>, #/find) is named as the page it now opens.
  const r = redirectOf(route) ?? route;
  switch (r.tab) {
    case APPLY_TAB: {
      const slug = companySlugOf(r);
      if (slug !== null) return companyBySlug(slug, ctx.jobs, ctx.docs)?.name || 'Company';
      if (!r.jobId) return 'Apply';
      const job = findJobById(r.jobId, ctx.jobs);
      return job ? titleOf(job) : 'Job';
    }
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
      return legalTitleFor(r.sub);
    case FIND_TAB:
    case '':
      return 'Find';
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
