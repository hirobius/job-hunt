// The Documents library (#227, epic #225): the user's Base documents, one section per kind
// (Résumé, Cover letter, Note, Outreach message), each with its own empty state and a New button.
// Opening one shows DocumentEditor; New opens an empty editor that creates the document on its
// first save, so an abandoned New leaves nothing behind. Which document is open can be held by the
// caller (a route) through `openId` / `onOpen`, or kept here when they are left out. The route is
// `#/copy-deck` (DocumentsView). Outreach messages are the templates the fill paths use
// (outreachTemplates.ts); the starter set can be restored here when one is missing. An empty
// library (a first run) is one empty state with one setup action, Add starter messages, and a quiet
// Start from scratch that shows the sections (Adrian 2026-10-22: nothing is added unasked).
// Layout (redesign §5.10, #552): grouped lists on one surface (the dialog), ordered by use: Messages,
// Cover letters, Résumés, then Notes; each group a flat panel with its count. One New key with a
// menu (Message, Cover letter, Résumé, Note) heads the library; an empty group is one row with its
// own Add. Each document is an expandable row (HDS Disclosure variant="row", one open at a time).
// The row's top line carries a Pinned badge, then the title, then a meta line: its blanks as a count
// ("5 blanks"), or for a document without blanks its versions and last edit (a message: its first
// line). The meta line is part of the trigger, so it
// stays while the row is open; open, the row shows the text with its line breaks (four lines on a
// phone, all of it from `sm` up) with the variables as chips, then Copy, Open and a menu (Pin,
// Duplicate, Delete). Delete is soft (#329): the row collapses and a notice offers Undo.
import { useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Copy, Ellipsis, FileText, Plus } from 'lucide-react';
import {
  Badge,
  Box,
  Button,
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
  getAllDocuments,
  replaceDocuments,
  setDocumentPinned,
  useDocuments,
} from './documents';
import { documentIdForSnippet, kindForSnippet, restoreStarterOutreach } from './snippetMigration';
import { STARTER_SNIPPETS } from './copyDeckStore';
import type { Document, DocumentKind } from './documents';
import { ItemList, Panel, PanelBody } from './PipelinePanel';
import { WithChips } from './BlankText';
import { postedAgo } from './feed/format';
import { metaLines } from './metaLines';
import { templateVariables } from './templateEditor';
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
  outreach: 'Messages',
};
/** One of a kind, as the New menu and an empty group's Add say it. */
const SINGULAR: Record<DocumentKind, string> = {
  resume: 'Résumé',
  cover: 'Cover letter',
  note: 'Note',
  outreach: 'Message',
};
// The library's order, by use (#552): Messages, Cover letters, Résumés, then Notes. The New menu
// lists them in the same order.
const LIBRARY_ORDER: DocumentKind[] = ['outreach', 'cover', 'resume', 'note'];
// An open row's text: a phone clamps it to four lines in CSS; a very long one is cut here.
const OPEN_PREVIEW_CHARS = 4000;

/** "Cover letter" → "cover letter"; Résumé keeps its case in the middle of a sentence too. */
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
const latest = (d: Document) => d.versions[d.versions.length - 1].text;
const firstLine = (text: string) => text.split('\n').find((l) => l.trim()) ?? '';
/** An open row's text: blank lines folded, so four phone lines hold more of it. */
const openText = (text: string) => text.slice(0, OPEN_PREVIEW_CHARS).replace(/\n\s*\n/g, '\n');
const versionsLabel = (n: number) => (n === 1 ? '1 version' : `${n} versions`);
/** A row's blanks as a count (#552): "1 blank", "5 blanks". */
const blanksLabel = (n: number) => (n === 1 ? '1 blank' : `${n} blanks`);

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
  headingAs = 'h1',
  listOnly = false,
}: {
  /** The heading level of the library's head and the editor's title (h2 in the Documents dialog). */
  headingAs?: 'h1' | 'h2';
  /** Always the list, never the editor (the dialog's left column at lg; `onOpen` opens beside). */
  listOnly?: boolean;
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

  if (!listOnly && open && 'kind' in open)
    return (
      <DocumentEditor
        key={`new-${open.kind}`}
        kind={open.kind}
        onBack={() => go(null)}
        onCreated={created}
        back={editorBack}
        returnTo={returnTo}
        titleAs={headingAs}
      />
    );
  const current = open && 'id' in open && docs.find((d) => d.id === open.id);
  if (!listOnly && current)
    return (
      <DocumentEditor
        key={current.id}
        doc={current}
        kind={current.kind}
        onBack={() => go(null)}
        onCreated={created}
        back={editorBack}
        returnTo={returnTo}
        titleAs={headingAs}
      />
    );

  const head = header ?? (
    <Text variant="title" as={headingAs}>
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
          onPage
          icon={FileText}
          title="No documents yet"
          description="Keep your résumé, cover letters, notes and messages here, and fill them for each job."
          action={
            <Stack direction="row" gap="tight" wrap="wrap" justify="center">
              <AddStarterMessages variant="primary" />
              <Button variant="secondary" onClick={() => setFromScratch(true)}>
                Start from scratch
              </Button>
            </Stack>
          }
        />
      </Stack>
    );

  return (
    <Stack gap="spacious">
      {/* The head, and the library's one New key (#552) at its end. */}
      <Stack direction="row" gap="tight" align="center" justify="space-between">
        {head}
        <NewMenu onPick={(kind) => go({ kind })} />
      </Stack>
      {/* Groups on the dialog's one surface (#552): flat panels, 24 apart. */}
      <Stack gap="px24">
        {LIBRARY_ORDER.map((kind) => {
          const items = libraryItems(docs, kind);
          const restorable = !!RESTORE_LABEL[kind] && starterMissing(docs, kind);
          return (
            <Panel
              key={kind}
              flat
              label={PLURAL[kind]}
              title={PLURAL[kind]}
              count={items.length}
              countLabel={`${items.length} ${lower(PLURAL[kind])}`}
            >
              {/* An empty group is one row with its own Add (#552). */}
              {items.length === 0 && (
                <ItemList as="div">
                  <Stack direction="row" gap="tight" align="center" wrap="wrap">
                    <Text variant="caption" as="span" tone="secondary">
                      {`No ${lower(PLURAL[kind])} yet.`}
                    </Text>
                    <Button
                      variant="tertiary"
                      size="sm"
                      iconLeft={<Icon icon={Plus} />}
                      onClick={() => go({ kind })}
                    >
                      {`Add ${lower(SINGULAR[kind])}`}
                    </Button>
                    {restorable && (
                      <Button variant="tertiary" size="sm" onClick={() => restore(kind)}>
                        {RESTORE_LABEL[kind]}
                      </Button>
                    )}
                  </Stack>
                </ItemList>
              )}
              {items.length > 0 && restorable && (
                <PanelBody>
                  <Box>
                    <Button variant="tertiary" size="sm" onClick={() => restore(kind)}>
                      {RESTORE_LABEL[kind]}
                    </Button>
                  </Box>
                </PanelBody>
              )}
              {items.length > 0 && (
                <ItemList label={PLURAL[kind]}>
                  {items.map((d) => (
                    <DocumentRow
                      key={d.id}
                      doc={d}
                      open={expanded === d.id}
                      onOpenChange={(o) => setExpanded(o ? d.id : null)}
                      onEdit={() => go({ id: d.id })}
                    />
                  ))}
                </ItemList>
              )}
            </Panel>
          );
        })}
      </Stack>
    </Stack>
  );
}

/** The library's one New key (#552): a menu of the kinds, in the library's order. */
function NewMenu({ onPick }: { onPick: (kind: DocumentKind) => void }) {
  // The browser's Back closes the menu and stays on the page (return paths).
  const menu = useBackSheet('documents-new');
  return (
    <Menu modal={false} {...menu}>
      <Menu.Trigger asChild>
        <Button variant="secondary" size="md" iconLeft={<Icon icon={Plus} />} label="New document">
          New
        </Button>
      </Menu.Trigger>
      <Menu.Content align="end">
        {LIBRARY_ORDER.map((kind) => (
          <Menu.Item key={kind} onSelect={() => onPick(kind)}>
            {SINGULAR[kind]}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu>
  );
}

/** One document as an expandable row: closed, its title and its blanks as a count; open, its first
 *  lines and Copy, Open and the menu. */
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
  // A row of its kind's list: the panel is the one card (Adrian 2026-11-01, #449).
  return (
    <Box as="li" ref={cardRef} aria-label={title} className="rjb-doc-row">
      <Box sx={{ py: 1 }}>
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
                // Its blanks as a count, never a row of chips (#552).
                <Text variant="caption" tone="secondary">
                  {blanksLabel(names.length)}
                </Text>
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
    </Box>
  );
}
