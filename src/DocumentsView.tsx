// The Documents dialog (#227; #471 slice 4: a dialog, not a page). It opens over the page it was
// asked from (`?documents=` in that page's hash: '' the library, a document's id, `new/<kind>` a
// New editor), so a link opens it and a reload keeps it, and the browser's Back closes it (or steps
// back inside it). At lg the library is the left column and the open document's editor the right
// ("Pick a document" until one is open); below lg one view at a time, the editor's Back returning to
// the library. Old `#/copy-deck[/<id>]` links redirect here (route.ts). An old
// `?documents=<snippetId>` opens the message that snippet became (rewritten in place), a job's own
// document opens its job, and an unknown id goes back to the library once sync has settled. Opened
// over a job, a Save closes it (back on the job, return paths).
import { useContext, useEffect } from 'react';
import { Box, Dialog, Stack, Text, useAtLeast } from '@hirobius/design-system';
import { FileText } from 'lucide-react';
import { EmptyState } from './hds-gaps/EmptyState';
import DocumentsLibrary from './DocumentsLibrary';
import { DOCUMENT_KINDS, useDocuments, type DocumentKind } from './documents';
import { documentJobUrl, resolveDocumentId } from './outreachTemplates';
import { useSnippets } from './copyDeckStore';
import { findJobById, jobIdOf } from './store';
import {
  closeDialog,
  dialogStepBack,
  navigate,
  openDocuments,
  useRoute,
  type Route,
} from './route';
import { useRouteLabel } from './routeLabel';
import { CloudSyncContext } from './account/accountContext';
import { usePageTitle } from './pageTitle';

const NEW = 'new/';

export default function DocumentsView() {
  const docs = useDocuments();
  const route = useRoute();
  const wide = useAtLeast('lg');
  // Read the context directly: this view also renders on its own in tests, outside the provider.
  const settled = useContext(CloudSyncContext)?.settled ?? true;
  // Snippets not moved yet (the move runs once sync settles): an old link may name one of them.
  const moving = useSnippets().some((s) => !s.migrated);
  const sub = route.documents || null;
  const newKind = sub?.startsWith(NEW)
    ? (DOCUMENT_KINDS.find((k) => k.kind === sub.slice(NEW.length))?.kind ?? null)
    : null;
  const named = sub && !sub.startsWith(NEW) ? resolveDocumentId(sub, docs) : null;
  // A job's own document or final copy (#328): its saved job's page holds it.
  const jobUrl = sub && !named ? documentJobUrl(sub, docs) : null;
  const jobId = jobUrl && findJobById(jobIdOf(jobUrl)) ? jobIdOf(jobUrl) : null;
  usePageTitle('Documents');

  useEffect(() => {
    if (!sub || newKind) return;
    if (named && named !== sub) openDocuments(named, true);
    else if (!named && (sub.startsWith(NEW) || (settled && !moving))) {
      // Its job, with the dialog closed (the job holds the document).
      if (jobId) navigate({ tab: 'apply', sub: null, jobId, documents: null }, true);
      // Unknown or deleted: the library.
      else openDocuments('', true);
    }
    // Only when the document or sync changes.
  }, [sub, newKind, named, settled, moving, jobId]);

  // Opened over a job: a Save closes the dialog, back on the job (return paths).
  const page: Route = { ...route, documents: null, legal: null };
  const overJob = route.tab === 'apply' && !!route.jobId;
  const pageLabel = useRouteLabel(page);
  const returnTo = overJob ? { label: pageLabel, go: closeDialog } : undefined;
  const toLibrary = () => dialogStepBack({ ...route, documents: '' });
  const open = (id: string | null) => (id ? openDocuments(id, wide) : toLibrary());
  const onNew = (kind: DocumentKind) => openDocuments(NEW + kind, wide);
  // The New editor's entry becomes the new document's.
  const onCreated = (id: string) => openDocuments(id, true);
  const editing = !!(named || newKind);

  const list = (
    <DocumentsLibrary
      headingAs="h2"
      header={<span />}
      listOnly={wide}
      openId={wide ? null : named}
      newKind={wide ? null : (newKind as DocumentKind | null)}
      onOpen={open}
      onNew={onNew}
      onCreated={onCreated}
      returnTo={returnTo}
    />
  );
  const editor = editing ? (
    <DocumentsLibrary
      headingAs="h2"
      openId={named}
      newKind={newKind as DocumentKind | null}
      onOpen={open}
      onNew={onNew}
      onCreated={onCreated}
      returnTo={returnTo}
    />
  ) : (
    <EmptyState
      framed
      icon={FileText}
      title="Pick a document"
      description="Open one from the list to edit it, or start a new one."
    />
  );
  return (
    <Dialog
      open={route.documents !== null && route.documents !== undefined}
      onOpenChange={(o) => !o && closeDialog()}
    >
      <Dialog.Content size="xl" className="rjb-dialog rjb-docs-dialog">
        <Dialog.Header>
          <Dialog.Title>Documents</Dialog.Title>
          <Dialog.Description>
            <Text variant="caption" as="span" tone="secondary">
              Résumés, cover letters, outreach messages and notes.
            </Text>
          </Dialog.Description>
        </Dialog.Header>
        <Box className="rjb-dialog-body">
          {wide ? (
            <Box className="rjb-docs-columns">
              <Box>{list}</Box>
              <Box>{editor}</Box>
            </Box>
          ) : (
            <Stack gap="normal">{list}</Stack>
          )}
        </Box>
      </Dialog.Content>
    </Dialog>
  );
}
