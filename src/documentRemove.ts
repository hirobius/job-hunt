// Delete a Base document softly (#329, #212): it goes at once and a notice offers Undo, which puts
// it back in its place with every Version (documents.restoreDocument). Like every other Remove in
// the app, there is no "can't be undone" confirm. The library row collapses first (collapseRow);
// the editor goes back to the library.
import {
  getAllDocuments,
  removeDocument,
  replaceDocuments,
  restoreDocument,
  type Document,
} from './documents';
import { highlightNew } from './feedback';
import { notifyRemoved, showNotice } from './saveNotice';
import { parseHash } from './route';

/** Remove a document with Undo. False when it is locked (a Sent Version) or already gone. */
export function removeDocumentWithUndo(d: Document): boolean {
  const at = getAllDocuments().findIndex((x) => x.id === d.id);
  if (at < 0 || !removeDocument(d.id)) return false;
  const title = d.title || 'Untitled';
  // In the Documents dialog (#471 slice 4) its footer shows the notice: a toast behind a modal can't
  // be reached.
  const r = parseHash(window.location.hash);
  const inDialog = r.documents !== null && r.documents !== undefined;
  notifyRemoved(
    `Deleted “${title}”`,
    () => {
      // The same id back meanwhile (Restore starter messages re-adds a starter's stock text): Undo
      // still brings back the user's own Versions.
      const all = getAllDocuments();
      if (all.some((x) => x.id === d.id)) {
        replaceDocuments(all.map((x) => (x.id === d.id ? d : x)));
        highlightNew(d.id);
      } else if (restoreDocument(d, at)) highlightNew(d.id);
      else
        showNotice({
          title: `“${title}” couldn't be put back`,
          description: "This device's storage is full. Remove a final copy first.",
          actions: [],
        });
    },
    undefined,
    { inDialog },
  );
  return true;
}
