// The Documents page (#227, epic #225): `#/copy-deck` is the library, `#/copy-deck/<id>` opens one
// document. It replaces Templates: the snippets moved into it as Outreach messages, so an old
// `#/copy-deck/<snippetId>` link opens the message that snippet became (the hash is rewritten to its
// id), and an unknown id goes back to the library once sync has settled (the document may not have
// arrived on this device yet). It has no tab (#240): the page names itself and links back to the
// Pipeline, whose Apply sheet links here, and it opens from the Menu.
import { useContext, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Box, Button, Icon } from '@hirobius/design-system';
import { PageHeader } from '@hirobius/design-system/patterns';
import DocumentsLibrary from './DocumentsLibrary';
import { useDocuments } from './documents';
import { resolveDocumentId } from './outreachTemplates';
import { useSnippets } from './copyDeckStore';
import { navigate, useRoute } from './route';
import { CloudSyncContext } from './account/accountContext';

const header = (
  <PageHeader
    level={2}
    breadcrumb={
      // HDS Button asChild drops iconLeft, so the arrow is the link's own child.
      <Button asChild variant="tertiary" size="md" className="rjb-back">
        <a href="#/queue" aria-label="Back to Pipeline">
          <Icon icon={ArrowLeft} />
          Pipeline
        </a>
      </Button>
    }
    title="Documents"
  />
);

export default function DocumentsView() {
  const docs = useDocuments();
  const route = useRoute();
  // Read the context directly: this view also renders on its own in tests, outside the provider.
  const settled = useContext(CloudSyncContext)?.settled ?? true;
  // Snippets not moved yet (the move runs once sync settles): an old link may name one of them.
  const moving = useSnippets().some((s) => !s.migrated);
  const named = route.sub ? resolveDocumentId(decodeURIComponent(route.sub), docs) : null;

  useEffect(() => {
    if (!route.sub) return;
    if (named && named !== decodeURIComponent(route.sub)) navigate({ sub: named }, true);
    else if (!named && settled && !moving) navigate({ sub: null }, true);
  }, [route.sub, named, settled, moving]);

  // The 760 content measure, like the job page: documents are prose.
  return (
    <Box sx={{ maxWidth: 'var(--semantic-layout-width-content)' }}>
      <DocumentsLibrary
        header={header}
        openId={named}
        onOpen={(id) => navigate({ sub: id ? encodeURIComponent(id) : null })}
      />
    </Box>
  );
}
