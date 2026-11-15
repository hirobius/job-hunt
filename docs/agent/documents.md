# Documents

The Documents dialog, the editor, templates and variables.

- **Documents library (#227; replaced Templates #132; a dialog since #471 slice 4):** one HDS `Dialog`
  (`DocumentsView.tsx`, size xl, titled "Documents") over the page it was asked from: `?documents=` on
  that page's hash (`''` the library, a document's id, `new/<kind>` a New editor; `route.documents`,
  `documentsHash` / `openDocuments` / `dialogStepBack` / `closeDialog`; `pageKey` ignores it). At lg the
  library is the left column (`listOnly`) and the open document's editor the right ("Pick a document"
  until one is open; a pick replaces the entry); below lg one view, an open pushes and the editor's Back
  steps back. Close, Escape and the browser's Back shut it on the page (a pop when the dialog-less entry
  is just behind, else in place); opened over a job, a Save closes it there. Old `#/copy-deck[/<id>]`
  links redirect in place to their `?from=` page (else Find) with the dialog open. Reached from the
  Account menu's Documents item (the job view's Edit documents link went with the Application kit, 2026-11-13). Headings in it are h2 (the
  page keeps its h1). **Grouped lists, one New menu, a blanks count (redesign §5.10, #552):** `DocumentsLibrary`
  is a flat `Panel` per kind on the dialog's one surface, ordered by use (Messages, Cover letters, Résumés, then
  Notes), each with its count; **one New key** heads the library, a Menu of Message, Cover letter, Résumé, Note
  (no New per group); an empty group is one row ("No résumés yet.") with its own Add; the `.rjb-docs-*` rules
  live in `DocumentsView.css` (off base.css). Each kind's list is HDS Disclosure
  rows, one open at a time (redesign slice 3, rev-3 M): closed, the title and its blanks as a count ("5 blanks", never chips);
  open, the first lines (`templateFill.previewText`, cut on a word or blank boundary) with Copy, Open
  (the editor) and a menu (Pin, Duplicate, Delete). `DocumentEditor` (rev-3 N: the document's title as
  the page head; Save, Version history and the menu in one row) saves each change as a Version.
  Outreach messages use HDS `TokenField` (each `[Name]` one atomic chip), the chip row + Insert
  variable `Menu` (`insertToken`), and the #221 **Variables panel** (Fill for, then each variable, then the
  filled Preview with Copy; a
  picked job's four fields save on the job, the rest on `Document.values`, not a Version; `[Your name]`
  falls back to the kit name). `#/copy-deck/<id>` opens one and `#/copy-deck/new/<kind>` is a New
  editor (its first Save replaces the entry with the new id); an old `#/copy-deck/<snippetId>` resolves
  to `snippet-<id>` (`outreachTemplates.resolveDocumentId`, hash rewritten); unknown → the library once
  sync has settled and the move below has run. **Snippets are legacy data** (store + blob sync kept):
  `App`'s `SnippetMigration` runs `migrateSnippetStore` after sync settles: each snippet not yet
  `migrated` becomes a Base Outreach message (`snippetMigration.ts`) and is marked `migrated` in the
  synced snippet store, so a deleted message never comes back and a second device adds nothing.
  "Restore starter messages" re-adds missing `tpl-*` (`restoreStarterOutreach`). **Every fill path reads
  `useOutreachTemplates()`** (latest Version text, values, pinned first; a moved message keeps its
  snippet id, so `tpl-followup` and the kit's picks still match): Use template and `FollowUp`, all through `templateFill.fillSnippet`. Editor menus are
  `modal={false}` (a modal menu plus the dialog left the page unclickable). Pinned in
  `documentsRoute.test.tsx`, `documentsLibrary.test.tsx`, `outreachTemplates.test.ts`; E2E
  `e2e/documents.spec.ts`, `e2e/template-variables.spec.ts`. Final copies (#231, uploaded PDF/Word)
  live in the synced blob, capped at 500 KB per file and 1 MB per account. Removing an unsent one has no
  confirm: it collapses and Undo re-adds it (`documents.restoreDocument`, the file with it).
