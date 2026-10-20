// Test helper: put these messages in the Documents library as Base Outreach messages (#227), the
// way the startup migration would, and leave nothing in the legacy snippet store to migrate.
import { replaceSnippets, type Snippet } from '../copyDeckStore';
import { replaceDocuments } from '../documents';
import { migrateSnippets } from '../snippetMigration';

export function setOutreachMessages(list: Snippet[]) {
  replaceSnippets([]);
  replaceDocuments(migrateSnippets(list, [], '2026-01-01T00:00:00.000Z'));
}
