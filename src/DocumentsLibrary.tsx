// The Documents library (#227, epic #225): the user's Base documents, one section per kind
// (Résumé, Cover letter, Note, Outreach message), each with its own empty state and a New button.
// Opening one shows DocumentEditor; New opens an empty editor that creates the document on its
// first save, so an abandoned New leaves nothing behind. Which document is open can be held by the
// caller (a route) through `openId` / `onOpen`, or kept here when they are left out. The route is
// `#/copy-deck` (DocumentsView). Outreach messages are the templates the fill paths use
// (outreachTemplates.ts); the starter set can be restored here when one is missing.
// Layout is the rev-3 mock's (item M, slice 3): a panel per kind with its count and a "New" button
// in the header; each document is an expandable row (HDS Disclosure variant="row", one open at a
// time) whose preview names its variables as chips; open, it shows the first lines with the
// variables as chips, then Copy, Open (the editor) and a menu (Pin, Duplicate, Delete).
import { useState, type ReactNode } from 'react';
import { Copy, Ellipsis, Plus } from 'lucide-react';
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Disclosure,
  Icon,
  Menu,
  Stack,
  Text,
  useToast,
} from '@hirobius/design-system';
import DocumentEditor from './DocumentEditor';
import {
  createDocument,
  DOCUMENT_KINDS,
  getAllDocuments,
  removeDocument,
  replaceDocuments,
  setDocumentPinned,
  useDocuments,
} from './documents';
import { documentIdForSnippet, kindForSnippet, restoreStarterOutreach } from './snippetMigration';
import { STARTER_SNIPPETS } from './copyDeckStore';
import type { Document, DocumentKind } from './documents';
import { Panel, PanelBody, PanelRows } from './PipelinePanel';
import { WithChips } from './BlankText';
import { templateVariables } from './templateEditor';
import { previewText } from './templateFill';
import { copyFilled } from './templateCopy';

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
// An open row's preview: about four lines of a phone row.
const OPEN_PREVIEW_CHARS = 220;

/** "Cover letter" → "cover letter"; Résumé keeps its case in the middle of a sentence too. */
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
const latest = (d: Document) => d.versions[d.versions.length - 1].text;
const firstLine = (text: string) => text.split('\n').find((l) => l.trim()) ?? '';
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
const restoreStarters = (kind: DocumentKind) =>
  replaceDocuments(restoreStarterOutreach(getAllDocuments(), new Date().toISOString(), kind));

export default function DocumentsLibrary({
  openId,
  onOpen,
  header,
}: {
  /** The open document's id, when a route holds it. */
  openId?: string | null;
  onOpen?: (id: string | null) => void;
  /** The library's page head; a plain "Documents" heading when left out. */
  header?: ReactNode;
} = {}) {
  const docs = useDocuments();
  const [local, setLocal] = useState<Open>(null);
  // One row open at a time (rev-3 M).
  const [expanded, setExpanded] = useState<string | null>(null);
  const controlled = openId !== undefined;
  const open: Open = controlled ? (openId ? { id: openId } : local) : local;
  // A New editor is always local state; an open document goes to the caller when it holds one.
  const go = (next: Open) => {
    if (!controlled || (next && 'kind' in next)) return setLocal(next);
    setLocal(null);
    onOpen?.(next ? next.id : null);
  };

  if (open && 'kind' in open)
    return (
      <DocumentEditor
        key={`new-${open.kind}`}
        kind={open.kind}
        onBack={() => go(null)}
        onCreated={(id) => go({ id })}
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
        onCreated={(id) => go({ id })}
      />
    );

  return (
    <Stack gap="spacious">
      {header ?? (
        <Text variant="title" as="h2">
          Documents
        </Text>
      )}
      {/* The Pipeline's panel rhythm: panels 24 apart (rev-3 mock). */}
      <Stack gap="px24">
        {DOCUMENT_KINDS.map(({ kind, label }) => {
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
                        <Button variant="tertiary" size="sm" onClick={() => restoreStarters(kind)}>
                          {RESTORE_LABEL[kind]}
                        </Button>
                      </Box>
                    )}
                  </Stack>
                </PanelBody>
              )}
              {items.length > 0 && (
                <PanelRows>
                  {items.map((d) => (
                    <DocumentRow
                      key={d.id}
                      doc={d}
                      open={expanded === d.id}
                      onOpenChange={(o) => setExpanded(o ? d.id : null)}
                      onEdit={() => go({ id: d.id })}
                    />
                  ))}
                </PanelRows>
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
  const [confirming, setConfirming] = useState(false);
  const text = latest(doc);
  const names = templateVariables(text);
  const title = doc.title || 'Untitled';
  const copy = async () => {
    const r = await copyFilled(text);
    if (r.ok) toast({ title: 'Copied', description: title, tone: 'success' });
    else toast({ title: "Couldn't copy", description: r.reason, tone: 'danger' });
  };
  const duplicate = () =>
    createDocument({ kind: doc.kind, title: `${title} (copy)`, text, base: true });
  return (
    <Box
      as="li"
      aria-label={title}
      className="rjb-doc-row"
      sx={{ px: 'md', py: 'xs', borderTop: 'thin solid', borderColor: 'border.default' }}
    >
      <Disclosure
        variant="row"
        open={open}
        onOpenChange={onOpenChange}
        label={
          <Stack gap="px4" align="start">
            {doc.pinned && <Badge>Pinned</Badge>}
            <span>{title}</span>
          </Stack>
        }
        preview={
          names.length ? (
            <WithChips text={names.map((n) => `[${n}]`).join(' ')} />
          ) : (
            `${firstLine(text) || 'Empty'} · ${versionsLabel(doc.versions.length)}`
          )
        }
      >
        {/* Only the open row renders its preview and actions. */}
        {open && (
          <Stack gap="normal">
            <Text variant="ui" as="p">
              <WithChips text={previewText(text, OPEN_PREVIEW_CHARS) || 'Empty'} />
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
              <Menu modal={false}>
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
                  <Menu.Item onSelect={() => setDocumentPinned(doc.id, !doc.pinned)}>
                    {doc.pinned ? 'Unpin' : 'Pin'}
                  </Menu.Item>
                  <Menu.Item onSelect={duplicate}>Duplicate</Menu.Item>
                  <Menu.Separator />
                  <Menu.Item onSelect={() => setConfirming(true)} tone="danger">
                    Delete
                  </Menu.Item>
                </Menu.Content>
              </Menu>
            </Stack>
          </Stack>
        )}
      </Disclosure>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>Delete “{title}”?</AlertDialog.Title>
            <AlertDialog.Description>
              Every version goes with it. This can't be undone.
            </AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                tone="danger"
                onClick={() => {
                  if (!removeDocument(doc.id))
                    toast({
                      title: "Couldn't delete",
                      description: 'A sent document is locked.',
                      tone: 'danger',
                    });
                }}
              >
                Delete
              </Button>
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
    </Box>
  );
}
