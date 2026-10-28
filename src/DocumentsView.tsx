// The Documents page (#227, epic #225): `#/copy-deck` is the library, `#/copy-deck/<id>` opens one
// document. It replaces Templates: the snippets moved into it as Outreach messages, so an old
// `#/copy-deck/<snippetId>` link opens the message that snippet became (the hash is rewritten to its
// id), and an unknown id goes back to the library once sync has settled (the document may not have
// arrived on this device yet). It has no tab (#240): the page names itself and opens from the Menu
// and the Apply sheet. `#/copy-deck/new/<kind>` is a New editor. Return paths: the page remembers
// where it was opened from (`from`), so its Back names that page ("← Apply mode (2 of 3)", else
// "← Pipeline"), the editor's Back goes to the library or straight to the job it came from, and a
// Save in an editor opened from a job page or Apply mode goes back there.
import { useContext, useEffect } from 'react';
import { Box } from '@hirobius/design-system';
import { PageHeader } from '@hirobius/design-system/patterns';
import DocumentsLibrary from './DocumentsLibrary';
import { DOCUMENT_KINDS, useDocuments, type DocumentKind } from './documents';
import { documentJobUrl, resolveDocumentId } from './outreachTemplates';
import { useSnippets } from './copyDeckStore';
import { findJobById, jobIdOf } from './store';
import { goBackTo, navigate, originOf, useRoute, withOrigin, type Route } from './route';
import { useRouteLabel } from './routeLabel';
import BackLink from './BackLink';
import type { Back } from './back';
import { CloudSyncContext } from './account/accountContext';

const PIPELINE: Route = { tab: 'queue', sub: null, pillar: null, jobId: null };
const LIBRARY: Route = { tab: 'copy-deck', sub: null, pillar: null, jobId: null };
const NEW = 'new/';

const isLibrary = (r: Route) => r.tab === 'copy-deck' && !r.sub;

/** Where a Save goes straight back to: the job page or Apply mode the editor was opened from,
 *  directly or through the library (return paths). Documents opened from anywhere else stay put. */
function returnTarget(route: Route): Route | null {
  let o = originOf(route);
  if (o && isLibrary(o)) o = originOf(o);
  return o && ((o.tab === 'queue' && o.jobId) || o.tab === 'apply') ? o : null;
}

// The editor's Back: "All documents" when it goes to the library, else the page it was opened from
// by name ("← Senior UX Designer", "← Apply mode (2 of 3)").
const libraryWords = (b: Back) => (isLibrary(b.origin) ? 'All documents' : b.label);
const libraryName = (b: Back) => (isLibrary(b.origin) ? null : `Back to ${b.label}`);

export default function DocumentsView() {
  const docs = useDocuments();
  const route = useRoute();
  // Read the context directly: this view also renders on its own in tests, outside the provider.
  const settled = useContext(CloudSyncContext)?.settled ?? true;
  // Snippets not moved yet (the move runs once sync settles): an old link may name one of them.
  const moving = useSnippets().some((s) => !s.migrated);
  const sub = route.sub ? decodeURIComponent(route.sub) : null;
  const newKind = sub?.startsWith(NEW)
    ? (DOCUMENT_KINDS.find((k) => k.kind === sub.slice(NEW.length))?.kind ?? null)
    : null;
  const named = sub && !sub.startsWith(NEW) ? resolveDocumentId(sub, docs) : null;
  const origin = originOf(route);
  // A job's own document or final copy (#328): its saved job's page holds it.
  const jobUrl = sub && !named ? documentJobUrl(sub, docs) : null;
  const jobId = jobUrl && findJobById(jobIdOf(jobUrl)) ? jobIdOf(jobUrl) : null;

  useEffect(() => {
    if (!sub || newKind) return;
    if (named && named !== sub) navigate({ sub: named, from: route.from ?? null }, true);
    else if (!named && (sub.startsWith(NEW) || (settled && !moving))) {
      // Its job page, keeping where the link came from (return paths).
      if (jobId) return navigate({ tab: 'queue', jobId, from: route.from ?? null }, true);
      // Unknown or deleted: back to the page that linked here, else the library.
      const back = originOf(route);
      if (back) goBackTo(back);
      else navigate({ sub: null }, true);
    }
    // The route is read as it is when the document or sync changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, newKind, named, settled, moving, jobId]);

  const target = returnTarget(route);
  const targetLabel = useRouteLabel(target ?? LIBRARY);
  // Back to the library: a pop when it is just behind, the same library (and its own origin).
  const toLibrary = () => goBackTo(origin && isLibrary(origin) ? origin : LIBRARY);

  // The 760 content measure, like the job page: documents are prose.
  return (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <DocumentsLibrary
        header={
          <PageHeader
            level={2}
            breadcrumb={
              // "← Pipeline", or the page Documents was opened from by name (return paths).
              <BackLink className="rjb-back" fallback={PIPELINE} fallbackLabel="Pipeline" />
            }
            title="Documents"
          />
        }
        openId={named}
        newKind={newKind as DocumentKind | null}
        onOpen={(id) =>
          id
            ? navigate(withOrigin({ tab: 'copy-deck', sub: encodeURIComponent(id) }, route))
            : toLibrary()
        }
        onNew={(kind) => navigate(withOrigin({ tab: 'copy-deck', sub: NEW + kind }, route))}
        // The New editor's entry becomes the new document's, keeping where it was opened from.
        onCreated={(id) =>
          navigate({ sub: encodeURIComponent(id), from: route.from ?? null }, true)
        }
        editorBack={
          <BackLink
            as="button"
            className="rjb-back"
            fallback={LIBRARY}
            fallbackLabel="All documents"
            text={libraryWords}
            ariaLabel={libraryName}
          />
        }
        returnTo={target ? { label: targetLabel, go: () => goBackTo(target) } : undefined}
      />
    </Box>
  );
}
