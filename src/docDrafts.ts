// A document's unsaved text, kept for the tab's session (QA). The browser's Back, a tab click or a
// reload takes the editor away with no chance to ask, so the draft waits here and the editor brings
// it back the next time that document opens. Per tab and never synced: a draft, not data. Storage
// can be missing or full (private mode); then the leave guard is the only net.
const key = (id: string) => `rjb_doc_draft:${id}`;

export function readDocDraft(id: string): string | null {
  try {
    return sessionStorage.getItem(key(id));
  } catch {
    return null;
  }
}

export function keepDocDraft(id: string, text: string) {
  try {
    sessionStorage.setItem(key(id), text);
  } catch {
    /* blocked or full: All documents and beforeunload still ask */
  }
}

export function dropDocDraft(id: string) {
  try {
    sessionStorage.removeItem(key(id));
  } catch {
    /* nothing kept */
  }
}
