// The Documents library (#227, epic #225): the user's Base documents, one section per kind
// (Résumé, Cover letter, Note, Outreach message), each with its own empty state and a New button.
// Opening one shows DocumentEditor; New opens an empty editor that creates the document on its
// first save, so an abandoned New leaves nothing behind. Which document is open can be held by the
// caller (a route) through `openId` / `onOpen`, or kept here when they are left out.
// Built standalone; wiring it into the Templates tab (`#/copy-deck`) waits for #234 to land.
import { useState } from 'react';
import { Star } from 'lucide-react';
import { Box, Button, Card, Icon, Stack, Text } from '@hirobius/design-system';
import EmptyState from './EmptyState';
import DocumentEditor from './DocumentEditor';
import { DOCUMENT_KINDS, useDocuments } from './documents';
import type { Document, DocumentKind } from './documents';
import { SECONDARY } from './hds-gaps/tone';

const LIST = { listStyle: 'none', margin: 0, padding: 0 } as const;
const ONE_LINE = {
  ...SECONDARY,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  display: 'block',
} as const;

const PLURAL: Record<DocumentKind, string> = {
  resume: 'Résumés',
  cover: 'Cover letters',
  note: 'Notes',
  outreach: 'Outreach messages',
};
const EMPTY_HINT: Record<DocumentKind, string> = {
  resume: 'Keep a base résumé here to copy into each job.',
  cover: 'Write a base cover letter once, then tailor a copy per job.',
  note: 'Keep notes you reuse, like your story or answers to common questions.',
  outreach: 'Write a message once; variables like [Company] fill in for each job.',
};

/** "Cover letter" → "cover letter"; Résumé keeps its case in the middle of a sentence too. */
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);
const latest = (d: Document) => d.versions[d.versions.length - 1].text;
const firstLine = (text: string) => text.split('\n').find((l) => l.trim()) ?? '';

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

export default function DocumentsLibrary({
  openId,
  onOpen,
}: {
  /** The open document's id, when a route holds it. */
  openId?: string | null;
  onOpen?: (id: string | null) => void;
} = {}) {
  const docs = useDocuments();
  const [local, setLocal] = useState<Open>(null);
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
      <Text variant="title" as="h2">
        Documents
      </Text>
      {DOCUMENT_KINDS.map(({ kind, label }) => {
        const items = libraryItems(docs, kind);
        const headId = `docs-${kind}`;
        const newLabel = `New ${lower(label)}`;
        const create = () => go({ kind });
        return (
          <section key={kind} aria-labelledby={headId}>
            <Stack gap="tight">
              <Stack direction="row" gap="tight" align="center" justify="space-between">
                <Text variant="body" as="h3" id={headId} className="rjb-semibold">
                  {PLURAL[kind]}
                </Text>
                {items.length > 0 && (
                  <Button variant="secondary" size="sm" onClick={create}>
                    {newLabel}
                  </Button>
                )}
              </Stack>
              {items.length === 0 ? (
                <EmptyState
                  title={`No ${lower(PLURAL[kind])} yet`}
                  message={EMPTY_HINT[kind]}
                  action={
                    <Button variant="secondary" size="sm" onClick={create}>
                      {newLabel}
                    </Button>
                  }
                />
              ) : (
                <Stack as="ul" gap="tight" style={LIST}>
                  {items.map((d) => (
                    <li key={d.id}>
                      <Card bordered padding="item">
                        <Stack gap="tight">
                          <Stack direction="row" gap="tight" align="center">
                            {d.pinned && (
                              <Box
                                as="span"
                                role="img"
                                aria-label="Pinned"
                                sx={{ display: 'inline-flex' }}
                              >
                                <Icon icon={Star} weight="fill" />
                              </Box>
                            )}
                            <Button variant="tertiary" onClick={() => go({ id: d.id })}>
                              {d.title || 'Untitled'}
                            </Button>
                          </Stack>
                          <Text variant="caption" as="span" style={ONE_LINE}>
                            {firstLine(latest(d)) || 'Empty'} ·{' '}
                            {d.versions.length === 1
                              ? '1 version'
                              : `${d.versions.length} versions`}
                          </Text>
                        </Stack>
                      </Card>
                    </li>
                  ))}
                </Stack>
              )}
            </Stack>
          </section>
        );
      })}
    </Stack>
  );
}
