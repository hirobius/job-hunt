// Export links (2026-10-22): one dialog, mounted once in DataToolsProvider and opened from the
// Pipeline's Jobs panel or the Account menu (exportLinks.ts holds the open scope). Its content is
// its own chunk, fetched on the first open (#371).
import { Dialog } from '@hirobius/design-system';
import { useBackCloses } from './useBackCloses';
import { closeExportLinks, useExportLinksScope } from './exportLinks';
import { ExportLinksDialog, useLoadedWhen } from './lazyDialogs';

/** Mounted once; renders the dialog while a scope is open. */
export function ExportLinksHost() {
  const scope = useExportLinksScope();
  useBackCloses(scope !== null, closeExportLinks, 'export-links');
  const ready = useLoadedWhen(ExportLinksDialog, scope !== null, closeExportLinks);
  return (
    <Dialog open={scope !== null && ready} onOpenChange={(o) => !o && closeExportLinks()}>
      {/* Keyed by the opening scope, so each open starts from where it was opened. */}
      {scope && ready && <ExportLinksDialog key={scope} initialScope={scope} />}
    </Dialog>
  );
}
