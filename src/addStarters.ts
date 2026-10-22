// The starter messages are the user's to add (Adrian 2026-10-22: a first run holds nothing the user
// didn't create). One call adds whichever starters are missing (restoreStarterOutreach: each under
// its own kind, never over one that is there). The button is StarterMessages.tsx.
import { getAllDocuments, replaceDocuments } from './documents';
import { restoreStarterOutreach } from './snippetMigration';

/** Add every starter message that is missing. */
export function addStarterMessages() {
  const docs = getAllDocuments();
  const next = restoreStarterOutreach(docs, new Date().toISOString());
  if (next !== docs) replaceDocuments(next);
}
