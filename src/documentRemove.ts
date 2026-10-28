// Delete a Base document softly (#329, #212): it goes at once and a notice offers Undo, which puts
// it back in its place with every Version (documents.restoreDocument). Like every other Remove in
// the app, there is no "can't be undone" confirm. The library row collapses first (collapseRow);
// the editor goes back to the library.
import { getAllDocuments, removeDocument, restoreDocument, type Document } from './documents';
import { highlightNew } from './feedback';
import { notifyRemoved, showNotice } from './saveNotice';

/** Remove a document with Undo. False when it is locked (a Sent Version) or already gone. */
export function removeDocumentWithUndo(d: Document): boolean {
  const at = getAllDocuments().findIndex((x) => x.id === d.id);
  if (at < 0 || !removeDocument(d.id)) return false;
  const title = d.title || 'Untitled';
  notifyRemoved(`Deleted “${title}”`, () => {
    if (restoreDocument(d, at)) highlightNew(d.id);
    else
      showNotice({
        title: `“${title}” couldn't be put back`,
        description: "This device's storage is full. Remove a final copy first.",
        actions: [],
      });
  });
  return true;
}
