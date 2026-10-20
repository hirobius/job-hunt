// One Base document in the library (#227): its title, its text and its Version history. The text
// is a draft until Save, and each Save adds a Version (documents.saveVersion), so earlier text
// stays readable and can be brought back into the draft. A new document has no id until its first
// Save creates it. Outreach messages keep the Templates editor's tools: token chips and the Insert
// variable menu over the chip field (hds-gaps/TokenTextarea), and a preview filled for a picked
// job through templateFill.fillSnippet (job fields, then the message's own values, then the kit
// name). Delete sits in a menu and asks first.
import { useRef, useState } from 'react';
import { ChevronLeft, EllipsisVertical, Plus } from 'lucide-react';
import {
  AlertDialog,
  Button,
  Disclosure,
  Icon,
  Input as HdsInput,
  Menu,
  Select,
  Stack,
  Surface,
  Tag,
  Text,
  Textarea,
  Tooltip as HdsTooltip,
  useToast,
} from '@hirobius/design-system';
import {
  createDocument,
  DOCUMENT_KINDS,
  removeDocument,
  renameDocument,
  saveVersion,
  setDocumentPinned,
} from './documents';
import type { Document, DocumentKind } from './documents';
import { DocumentDownload } from './DocumentDownload';
import { useJobs } from './store';
import { useApplyKit } from './applyKit';
import { fillSnippet } from './templateFill';
import { insertToken, TOKEN_CHIPS } from './templateEditor';
import TokenTextarea from './hds-gaps/TokenTextarea';
import type { TokenTextareaHandle } from './hds-gaps/TokenTextarea';
import { copyFilled } from './templateCopy';
import { metaLines } from './metaLines';
import { DANGER, SECONDARY } from './hds-gaps/tone';

const NO_JOB = 'none';
const FULL = { width: '100%' } as const;
const PRE = { margin: 0, whiteSpace: 'pre-wrap' } as const;
const LIST = { listStyle: 'none', margin: 0, padding: 0 } as const;

const labelOf = (kind: DocumentKind) =>
  DOCUMENT_KINDS.find((k) => k.kind === kind)?.label ?? 'Document';
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export default function DocumentEditor({
  doc,
  kind,
  onBack,
  onCreated,
}: {
  /** The document to edit; left out for a new one, which is created on its first Save. */
  doc?: Document;
  kind: DocumentKind;
  onBack: () => void;
  onCreated: (id: string) => void;
}) {
  const { toast } = useToast();
  const label = labelOf(kind);
  const saved = doc ? doc.versions[doc.versions.length - 1].text : '';
  const [title, setTitle] = useState(doc ? doc.title : label);
  const [draft, setDraft] = useState(saved);
  // A newer Version synced in: an untouched draft follows it, so Save never re-saves older text.
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    if (draft === seen) setDraft(saved);
    setSeen(saved);
  }
  const [confirming, setConfirming] = useState(false);
  const outreach = kind === 'outreach';
  const dirty = doc ? draft !== saved : true;

  const save = () => {
    if (!doc) {
      const id = createDocument({ kind, title: title.trim() || label, text: draft, base: true });
      toast({ title: 'Saved', description: title.trim() || label, tone: 'success' });
      onCreated(id);
      return;
    }
    if (saveVersion(doc.id, draft))
      toast({ title: `Saved as version ${doc.versions.length + 1}`, tone: 'success' });
  };
  const commitTitle = () => {
    if (doc && title.trim() !== doc.title) renameDocument(doc.id, title);
  };

  return (
    <Stack gap="normal">
      <Stack direction="row" gap="tight" align="center">
        <Button variant="tertiary" iconLeft={<Icon icon={ChevronLeft} />} onClick={onBack}>
          All documents
        </Button>
      </Stack>
      <Text variant="caption" as="p" style={SECONDARY}>
        {label} · Base document
      </Text>
      <HdsInput
        label="Title"
        value={title}
        placeholder="Untitled"
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
      />
      {outreach ? (
        <OutreachText value={draft} onChange={setDraft} values={doc?.values} />
      ) : (
        <Textarea
          label="Text"
          rows={12}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={FULL}
        />
      )}
      <Stack direction="row" gap="tight" align="center">
        <Button variant="primary" onClick={save} disabled={!dirty}>
          Save
        </Button>
        {doc && (
          // Not modal: a modal menu and the confirm dialog both lock body pointer events (#132).
          <Menu modal={false}>
            <Menu.Trigger asChild>
              <Button
                variant="tertiary"
                iconOnly
                iconLeft={<Icon icon={EllipsisVertical} />}
                label="More actions"
              />
            </Menu.Trigger>
            <Menu.Content align="start">
              <Menu.Item onSelect={() => setDocumentPinned(doc.id, !doc.pinned)}>
                {doc.pinned ? 'Unpin' : 'Pin'}
              </Menu.Item>
              <Menu.Separator />
              {/* HDS Menu.Item has no danger tone; the feedback token marks the destructive item. */}
              <Menu.Item onSelect={() => setConfirming(true)} style={DANGER}>
                Delete
              </Menu.Item>
            </Menu.Content>
          </Menu>
        )}
      </Stack>
      {doc && <VersionHistory doc={doc} onUse={setDraft} />}
      {doc && (
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialog.Content>
            <AlertDialog.Header>
              <AlertDialog.Title>Delete “{doc.title || 'Untitled'}”?</AlertDialog.Title>
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
                    if (removeDocument(doc.id)) onBack();
                    else
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
      )}
    </Stack>
  );
}

/** An Outreach message's text: token chips + Insert variable over the chip field, and a preview
 *  filled for a picked job with Copy. */
function OutreachText({
  value,
  onChange,
  values,
}: {
  value: string;
  onChange: (v: string) => void;
  values?: Record<string, string>;
}) {
  const { toast } = useToast();
  const jobs = useJobs();
  const kitName = useApplyKit().fields.name;
  const [fillFor, setFillFor] = useState<string | null>(null);
  const job = jobs.find((j) => j.url === fillFor);
  const filled = fillSnippet({ body: value, values }, job, kitName);

  const area = useRef<TokenTextareaHandle>(null);
  const insert = (token: string) => {
    const sel = area.current?.selection();
    const r = insertToken(value, sel?.start ?? null, sel?.end ?? null, token);
    onChange(r.value);
    area.current?.setCaret(r.caret);
  };
  const copy = async () => {
    const r = await copyFilled(filled);
    if (r.ok) toast({ title: 'Copied', tone: 'success' });
    else toast({ title: "Couldn't copy", description: r.reason, tone: 'danger' });
  };
  const options = [
    { value: NO_JOB, label: 'No job (show [Tokens])' },
    ...jobs.map((j) => ({
      value: j.url,
      label: metaLines([j.label, j.company])[0] || j.url,
    })),
  ];

  return (
    <Stack gap="normal">
      <Stack gap="tight">
        <Stack direction="row" wrap="wrap" gap="tight" align="center">
          {TOKEN_CHIPS.map((c) => (
            <HdsTooltip key={c.token}>
              <HdsTooltip.Trigger asChild>
                <Tag onClick={() => insert(c.token)}>{c.token}</Tag>
              </HdsTooltip.Trigger>
              <HdsTooltip.Content>{c.hint}</HdsTooltip.Content>
            </HdsTooltip>
          ))}
          <Menu>
            <Menu.Trigger asChild>
              <Button variant="secondary" size="sm" iconLeft={<Icon icon={Plus} />}>
                Insert variable
              </Button>
            </Menu.Trigger>
            <Menu.Content align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
              {TOKEN_CHIPS.map((c) => (
                <Menu.Item key={c.token} onSelect={() => insert(c.token)}>
                  {c.token.slice(1, -1)}
                </Menu.Item>
              ))}
            </Menu.Content>
          </Menu>
        </Stack>
        <TokenTextarea
          ref={area}
          aria-label="Message text"
          value={value}
          placeholder="Paste or write your message…"
          onChange={onChange}
        />
        <Text variant="caption" as="p" style={SECONDARY}>
          Type a name in square brackets, like [Hiring manager], to make your own variable.
        </Text>
      </Stack>
      <Select
        label="Fill for"
        options={options}
        value={job ? job.url : NO_JOB}
        onChange={(v) => setFillFor(v === NO_JOB ? null : v)}
      />
      <Surface padding="px16" role="region" aria-label="Preview">
        <Text variant="body" as="p" style={PRE}>
          {filled || 'Nothing to preview yet.'}
        </Text>
      </Surface>
      <Stack direction="row" gap="tight">
        <Button variant="secondary" onClick={copy}>
          Copy filled text
        </Button>
      </Stack>
    </Stack>
  );
}

/** Every saved Version, newest first; one can be read and brought back into the draft. */
function VersionHistory({ doc, onUse }: { doc: Document; onUse: (text: string) => void }) {
  const versions = doc.versions;
  const [shown, setShown] = useState<string | null>(null);
  const numbered = versions.map((v, i) => ({ v, n: i + 1 })).reverse();
  const pick = numbered.find((x) => x.v.id === shown);
  return (
    <Disclosure label={`Version history (${versions.length})`}>
      <Stack gap="tight">
        <Stack as="ul" gap="tight" style={LIST}>
          {numbered.map(({ v, n }) => (
            <li key={v.id}>
              <Button
                variant="tertiary"
                size="sm"
                aria-pressed={v.id === shown}
                onClick={() => setShown(v.id === shown ? null : v.id)}
              >
                {`Version ${n} · ${when(v.savedAt)}`}
              </Button>
            </li>
          ))}
        </Stack>
        {pick && (
          <Surface padding="px16" role="region" aria-label={`Version ${pick.n}`}>
            <Stack gap="tight">
              <Text variant="body" as="p" style={PRE}>
                {pick.v.text || 'Empty'}
              </Text>
              <Stack direction="row" gap="tight">
                <Button variant="secondary" size="sm" onClick={() => onUse(pick.v.text)}>
                  Use this text
                </Button>
                <DocumentDownload doc={doc} version={pick.v} />
              </Stack>
            </Stack>
          </Surface>
        )}
      </Stack>
    </Disclosure>
  );
}
