// The Documents library (#227, epic #225): the user's Base documents, one section per kind
// (Résumé, Cover letter, Note, Outreach message), each with its own empty state and a New button.
// Opening one shows DocumentEditor; New opens an empty editor that creates the document on its
// first save, so an abandoned New leaves nothing behind. Which document is open can be held by the
// caller (a route) through `openId` / `onOpen`, or kept here when they are left out. The route is
// `#/copy-deck` (DocumentsView). Outreach messages are the templates the fill paths use
// (outreachTemplates.ts); the starter set can be restored here when one is missing. An empty
// library (a first run) is one empty state with one setup action, Add starter messages, and a quiet
// Start from scratch that shows the sections (Adrian 2026-10-22: nothing is added unasked).
// Layout is the rev-3 mock's (item M): a panel per kind with its count and a "New" button in the
// header (Résumés, Cover letters, Outreach messages, Notes); each document is an expandable row (HDS
// Disclosure variant="row", one open at a time). The row's top line carries a Pinned badge, then the
// title, then a meta line: its variables as chips (no brackets, all of them, wrapping), or for a
// document without variables its versions and last edit. The meta line is part of the trigger, so it
// stays while the row is open; open, the row shows the text with its line breaks (four lines on a
// phone, all of it from `sm` up) with the variables as chips, then Copy, Open and a menu (Pin,
// Duplicate, Delete). Delete is soft (#329): the row collapses and a notice offers Undo.
import { useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Copy, Ellipsis, FileText, Plus } from 'lucide-react';
import {
  Badge,
  Box,
  Button,
  Card,
  Disclosure,
  Icon,
  Menu,
  Skeleton,
  Stack,
  Text,
  useToast,
} from '@hirobius/design-system';
import DocumentEditor from './DocumentEditor';
import {
  createDocument,
  DOCUMENT_KINDS,
  getAllDocuments,
  replaceDocuments,
  setDocumentPinned,
  useDocuments,
} from './documents';
import { documentIdForSnippet, kindForSnippet, restoreStarterOutreach } from './snippetMigration';
import { STARTER_SNIPPETS } from './copyDeckStore';
import type { Document, DocumentKind } from './documents';
import { CardList, Panel, PanelBody } from './PipelinePanel';
import { WithChips } from './BlankText';
import { postedAgo } from './feed/format';
import { metaLines } from './metaLines';
import { rowChips, templateVariables } from './templateEditor';
import { copyFilled } from './templateCopy';
import { collapseRow, highlightNew, useHighlight } from './feedback';
import { removeDocumentWithUndo } from './documentRemove';
import { useBackSheet } from './useBackCloses';
import { EmptyState } from './hds-gaps/EmptyState';
import { AddStarterMessages } from './StarterMessages';
import { CloudSyncContext } from './account/accountContext';
import { useSnippets } from './copyDeckStore';

const PLURAL: Record<DocumentKind, string> = {
  resume: 'Résumés',
  cover: 'Cover letters',
  note: 'Notes',
  outreach: 'Outreach messages',
};
const EMPTY_HINT: Record<DocumentKind, string> = {
  resume: 'Keep a base résumé here to copy into each job.',
  cover: 'Write a base cover letter once, then tailor a copy per job.',
  note: 'Keep stories and answers you reuse.',
  outreach: 'Write a message once; variables like [Company] fill in for each job.',
};
// The library's order (the rev-3 mock): the kinds people reuse per job first, Notes last.
const LIBRARY_ORDER: DocumentKind[] = ['resume', 'cover', 'outreach', 'note'];
// An open row's text: a phone clamps it to four lines in CSS; a very long one is cut here.
const OPEN_PREVIEW_CHARS = 4000;

/** "Cover letter" → "cover letter"; Résumé keeps its case in the middle of a sentence too. */
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
const latest = (d: Document) => d.versions[d.versions.length - 1].text;
const firstLine = (text: string) => text.split('\n').find((l) => l.trim()) ?? '';
/** An open row's text: blank lines folded, so four phone lines hold more of it. */
const openText = (text: string) => text.slice(0, OPEN_PREVIEW_CHARS).replace(/\n\s*\n/g, '\n');
const versionsLabel = (n: number) => (n === 1 ? '1 version' : `${n} versions`);

/** Base documents of a kind, pinned first, then by title. */
function libraryItems(docs: Document[], kind: DocumentKind): Document[] {
  return docs
    .filter((d) => d.base && d.kind === kind)
    .sort(
      (a, b) =>
        Number(!!b.pinned) - Number(!!a.pinned) ||
        a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    );
}

type Open = { id: string } | { kind: DocumentKind } | null;

/** The kinds that hold a starter, and the restore button's label in each. */
const RESTORE_LABEL: Partial<Record<DocumentKind, string>> = {
  outreach: 'Restore starter messages',
  cover: 'Restore starter cover letter',
};
const starterMissing = (docs: Document[], kind: DocumentKind) =>
  STARTER_SNIPPETS.some(
    (s) => kindForSnippet(s.id) === kind && !docs.some((d) => d.id === documentIdForSnippet(s.id)),
  );
/** Put back the missing starters of a kind; returns the ones it added, in the library's order. */
function restoreStarters(kind: DocumentKind): Document[] {
  const before = getAllDocuments();
  replaceDocuments(restoreStarterOutreach(before, new Date().toISOString(), kind));
  const added = getAllDocuments().filter((d) => !before.some((b) => b.id === d.id));
  return libraryItems(added, kind);
}
/** What a restore says it added (#327). */
const restoredTitle = (kind: DocumentKind, n: number) =>
  kind === 'cover'
    ? 'Added the starter cover letter'
    : n === 1
      ? 'Added 1 starter message'
      : `Added ${n} starter messages`;

export default function DocumentsLibrary({
  openId,
  onOpen,
  header,
  newKind,
  onNew,
  onCreated,
  editorBack,
  returnTo,
}: {
  /** The open document's id, when a route holds it. */
  openId?: string | null;
  onOpen?: (id: string | null) => void;
  /** The library's page head; a plain "Documents" heading when left out. */
  header?: ReactNode;
  /** A New editor's kind, when a route holds it (`#/copy-deck/new/<kind>`), with `onNew` opening
   *  one and `onCreated` taking its first Save. Left out, New is local state here. */
  newKind?: DocumentKind | null;
  onNew?: (kind: DocumentKind) => void;
  onCreated?: (id: string) => void;
  /** The editor's Back, when the page draws it (return paths). */
  editorBack?: ReactNode;
  /** Where a Save in the editor goes straight back to (a job or Apply mode, return paths). */
  returnTo?: { label: string; go: () => void };
} = {}) {
  const docs = useDocuments();
  const { toast } = useToast();
  const [local, setLocal] = useState<Open>(null);
  // One row open at a time (rev-3 M).
  const [expanded, setExpanded] = useState<string | null>(null);
  // An empty library shows its sections only once the user starts from scratch.
  const [fromScratch, setFromScratch] = useState(false);
  const settled = useContext(CloudSyncContext)?.settled ?? true;
  // Snippets not moved yet become documents once sync settles (App's SnippetMigration).
  const moving = useSnippets().some((s) => !s.migrated);
  const controlled = openId !== undefined;
  const open: Open = newKind
    ? { kind: newKind }
    : controlled
      ? openId
        ? { id: openId }
        : local
      : local;
  // A New editor is local state unless the caller routes it; an open document goes to the caller
  // when it holds one.
  const go = (next: Open) => {
    if (next && 'kind' in next && onNew) return onNew(next.kind);
    if (!controlled || (next && 'kind' in next)) return setLocal(next);
    setLocal(null);
    onOpen?.(next ? next.id : null);
  };
  const created = (id: string) => (onCreated ? onCreated(id) : go({ id }));
  // Restoring answers (#212, #327): a toast naming what came back, and the first restored row
  // scrolled into view and flashed (on a phone it can land below the fold).
  const restore = (kind: DocumentKind) => {
    const added = restoreStarters(kind);
    if (!added.length) return;
    toast({ title: restoredTitle(kind, added.length), tone: 'success' });
    highlightNew(added[0].id);
  };

  if (open && 'kind' in open)
    return (
      <DocumentEditor
        key={`new-${open.kind}`}
        kind={open.kind}
        onBack={() => go(null)}
        onCreated={created}
        back={editorBack}
        returnTo={returnTo}
      />
    );
  const current = open && docs.find((d) => d.id === open.id);
  if (current)
    return (
      <DocumentEditor
        key={current.id}
        doc={current}
        kind={current.kind}
        onBack={() => go(null)}
        onCreated={created}
        back={editorBack}
        returnTo={returnTo}
      />
    );

  const head = header ?? (
    <Text variant="title" as="h1">
      Documents
    </Text>
  );
  // A new device's documents arrive with sync (and the snippet move after it): until both are done,
  // "No documents yet" would be wrong and Add starter messages could land over the user's own
  // edited messages (review of ef40fc6). Outside the provider (tests) it counts as settled.
  if (!fromScratch && !docs.some((d) => d.base) && (!settled || moving))
    return (
      <Stack gap="spacious">
        {head}
        <Box aria-busy aria-label="Loading">
          <Stack gap="normal">
            <Skeleton variant="text" width="40%" />
            <Skeleton variant="text" width="70%" />
          </Stack>
        </Box>
      </Stack>
    );
  if (!fromScratch && !docs.some((d) => d.base))
    return (
      <Stack gap="spacious">
        {head}
        <EmptyState
          framed
          icon={FileText}
          title="No documents yet"
          description="Keep your résumé, cover letters, notes and messages here, and fill them for each job."
          action={
            <Stack direction="row" gap="tight" wrap="wrap" justify="center">
              <AddStarterMessages variant="primary" />
              <Button variant="tertiary" onClick={() => setFromScratch(true)}>
                Start from scratch
              </Button>
            </Stack>
          }
        />
      </Stack>
    );

  return (
    <Stack gap="spacious">
      {head}
      {/* The Pipeline's panel rhythm: panels 24 apart (rev-3 mock). */}
      <Stack gap="px24">
        {LIBRARY_ORDER.map((kind) => {
          const label = DOCUMENT_KINDS.find((k) => k.kind === kind)!.label;
          const items = libraryItems(docs, kind);
          const newLabel = `New ${lower(label)}`;
          return (
            <Panel
              key={kind}
              label={PLURAL[kind]}
              title={PLURAL[kind]}
              count={items.length}
              countLabel={`${items.length} ${lower(PLURAL[kind])}`}
              trailing={
                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<Icon icon={Plus} />}
                  label={newLabel}
                  onClick={() => go({ kind })}
                >
                  New
                </Button>
              }
            >
              {(items.length === 0 || (RESTORE_LABEL[kind] && starterMissing(docs, kind))) && (
                <PanelBody>
                  <Stack gap="tight">
                    {items.length === 0 && (
                      <Text variant="caption" as="p" tone="secondary">
                        {`No ${lower(PLURAL[kind])} yet. ${EMPTY_HINT[kind]}`}
                      </Text>
                    )}
                    {RESTORE_LABEL[kind] && starterMissing(docs, kind) && (
                      <Box>
                        <Button variant="tertiary" size="sm" onClick={() => restore(kind)}>
                          {RESTORE_LABEL[kind]}
                        </Button>
                      </Box>
                    )}
                  </Stack>
                </PanelBody>
              )}
              {items.length > 0 && (
                <CardList label={PLURAL[kind]}>
                  {items.map((d) => (
                    <DocumentRow
                      key={d.id}
                      doc={d}
                      open={expanded === d.id}
                      onOpenChange={(o) => setExpanded(o ? d.id : null)}
                      onEdit={() => go({ id: d.id })}
                    />
                  ))}
                </CardList>
              )}
            </Panel>
          );
        })}
      </Stack>
    </Stack>
  );
}

/** One document as an expandable row: closed, its title and variables; open, its first lines and
 *  Copy, Open and the menu. */
function DocumentRow({
  doc,
  open,
  onOpenChange,
  onEdit,
}: {
  doc: Document;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}) {
  const { toast } = useToast();
  // The browser's Back closes the menu and stays on the page (return paths).
  const menu = useBackSheet(`doc-menu:${doc.id}`);
  // The clock for "edited 3d ago", read once when the row mounts.
  const [now] = useState(() => Date.now());
  const text = latest(doc);
  const names = templateVariables(text);
  const chips = rowChips(names);
  const title = doc.title || 'Untitled';
  const copy = async () => {
    const r = await copyFilled(text);
    if (r.ok) toast({ title: 'Copied', description: title, tone: 'success' });
    else toast({ title: "Couldn't copy", description: r.reason, tone: 'danger' });
  };
  const saved = doc.versions[doc.versions.length - 1].savedAt;
  const edited = postedAgo(saved, now);
  const meta =
    doc.kind === 'outreach'
      ? firstLine(text) || 'Empty'
      : metaLines([versionsLabel(doc.versions.length), edited && `edited ${edited}`])[0];
  // Duplicate and Pin move the row, so the row they land on scrolls into view and flashes (#212).
  const duplicate = () =>
    highlightNew(createDocument({ kind: doc.kind, title: `${title} (copy)`, text, base: true }));
  const pin = () => {
    setDocumentPinned(doc.id, !doc.pinned);
    highlightNew(doc.id);
    toast({ title: doc.pinned ? 'Unpinned' : 'Pinned', description: title });
  };
  const highlight = useHighlight<HTMLDivElement>(doc.id);
  // The card itself, so Delete can collapse it (#212).
  const card = useRef<HTMLDivElement | null>(null);
  const cardRef = useCallback(
    (el: HTMLDivElement | null) => {
      card.current = el;
      highlight(el);
    },
    [highlight],
  );
  // Soft, like every other Remove (#329): the row collapses, then goes, with Undo.
  const remove = () => {
    // A locked one (a Sent Version) is refused before its row collapses, so it never hides.
    if (doc.versions.some((v) => v.sentAt))
      return toast({
        title: "Couldn't delete",
        description: 'A sent document is locked.',
        tone: 'danger',
      });
    collapseRow(card.current, () => removeDocumentWithUndo(doc));
  };
  // A card of its kind's list (Adrian 2026-10-23: cards, not hairlines).
  return (
    <Card
      as="li"
      ref={cardRef}
      aria-label={title}
      padding="none"
      className="rjb-doc-row rjb-card-inset"
    >
      <Box sx={{ px: 4, py: 1 }}>
        <Disclosure
          variant="row"
          open={open}
          onOpenChange={onOpenChange}
          label={
            <Stack gap="px4" align="start">
              {doc.pinned && <Badge>Pinned</Badge>}
              <span>{title}</span>
              {doc.kind !== 'outreach' && (
                <Text variant="caption" tone="secondary">
                  {meta}
                </Text>
              )}
              {names.length > 0 ? (
                <Stack direction="row" gap="px4" wrap="wrap">
                  {chips.shown.map((n) => (
                    <span key={n} className="rjb-chip">
                      {n}
                    </span>
                  ))}
                  {chips.more > 0 && <span className="rjb-chip">+{chips.more}</span>}
                </Stack>
              ) : (
                doc.kind === 'outreach' && (
                  <Text variant="caption" tone="secondary" className="rjb-truncate">
                    {meta}
                  </Text>
                )
              )}
            </Stack>
          }
        >
          {/* Only the open row renders its preview and actions. */}
          {open && (
            <Stack gap="normal">
              <Text variant="ui" as="p" className="rjb-doc-preview">
                <WithChips text={openText(text) || 'Empty'} />
              </Text>
              <Stack direction="row" gap="tight" align="center" justify="space-between">
                <Stack direction="row" gap="tight" align="center">
                  <Button
                    variant="secondary"
                    size="md"
                    iconLeft={<Icon icon={Copy} />}
                    onClick={copy}
                  >
                    Copy
                  </Button>
                  <Button variant="secondary" size="md" label={`Open ${title}`} onClick={onEdit}>
                    Open
                  </Button>
                </Stack>
                <Menu modal={false} {...menu}>
                  <Menu.Trigger asChild>
                    <Button
                      variant="secondary"
                      size="md"
                      iconOnly
                      iconLeft={<Icon icon={Ellipsis} />}
                      label={`More actions for ${title}`}
                    />
                  </Menu.Trigger>
                  <Menu.Content align="end">
                    <Menu.Item onSelect={pin}>{doc.pinned ? 'Unpin' : 'Pin'}</Menu.Item>
                    <Menu.Item onSelect={duplicate}>Duplicate</Menu.Item>
                    <Menu.Separator />
                    <Menu.Item onSelect={remove} tone="danger">
                      Delete
                    </Menu.Item>
                  </Menu.Content>
                </Menu>
              </Stack>
            </Stack>
          )}
        </Disclosure>
      </Box>
    </Card>
  );
}
