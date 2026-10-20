// One Base document in the library (#227): its title, its text and its Version history. The text
// is a draft until Save, and each Save adds a Version (documents.saveVersion), so earlier text
// stays readable and can be brought back into the draft. A new document has no id until its first
// Save creates it. Outreach messages keep the Templates editor's tools: token chips and the Insert
// variable menu over the chip field (hds-gaps/TokenTextarea), and a preview filled for a picked
// job through templateFill.fillSnippet (job fields, then the message's own values, then the kit
// name), and the Variables panel (#221): a picked job's four fields are saved on the job, every
// other value on the message (`Document.values`, not a Version). Delete sits in a menu and asks
// first.
import { useRef, useState, type ReactNode } from 'react';
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
  setDocumentValues,
} from './documents';
import type { Document, DocumentKind } from './documents';
import { DocumentDownload } from './DocumentDownload';
import { updateJob, useJobs } from './store';
import type { Job } from './types';
import { useApplyKit } from './applyKit';
import { fillSnippet, ownValue, resolveVariables } from './templateFill';
import { insertToken, templateVariables, TOKEN_CHIPS } from './templateEditor';
import TokenTextarea from './hds-gaps/TokenTextarea';
import type { TokenTextareaHandle } from './hds-gaps/TokenTextarea';
import { copyFilled } from './templateCopy';
import { metaLines } from './metaLines';
import { DANGER } from './hds-gaps/tone';

const NO_JOB = 'none';
const FULL = { width: '100%' } as const;
const PRE = { margin: 0, whiteSpace: 'pre-wrap' } as const;
const LIST = { listStyle: 'none', margin: 0, padding: 0 } as const;
// The variables a picked job fills, and the job field each one is saved to.
const JOB_FIELD: Record<string, 'company' | 'label' | 'contact' | 'angle'> = {
  company: 'company',
  role: 'label',
  contact: 'contact',
  angle: 'angle',
};

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

  // Save sits right under the text (an Outreach message's preview and Variables come after it).
  const actions = (
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
  );

  return (
    <Stack gap="normal">
      <Stack direction="row" gap="tight" align="center">
        <Button variant="tertiary" iconLeft={<Icon icon={ChevronLeft} />} onClick={onBack}>
          All documents
        </Button>
      </Stack>
      <Text variant="caption" as="p" tone="secondary">
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
        <OutreachText
          value={draft}
          onChange={setDraft}
          docId={doc?.id}
          values={doc?.values}
          actions={actions}
        />
      ) : (
        <Textarea
          label="Text"
          rows={12}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={FULL}
        />
      )}
      {!outreach && actions}
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
  docId,
  values,
  actions,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Save and the menu, right under the text. */
  actions: ReactNode;
  /** Set once the message exists: its variable values are saved on it. */
  docId?: string;
  values?: Record<string, string>;
}) {
  const { toast } = useToast();
  const jobs = useJobs();
  const kitName = useApplyKit().fields.name;
  const [fillFor, setFillFor] = useState<string | null>(null);
  const job = jobs.find((j) => j.url === fillFor);
  const filled = fillSnippet({ body: value, values }, job, kitName);
  const names = templateVariables(value);
  const resolved = resolveVariables(names, values, job, kitName);
  const missing = names.filter((n) => !resolved[n.toLowerCase()]).map((n) => `[${n}]`);
  // fromEntries makes own keys, so even a variable named `__proto__` is kept as a plain value.
  const setValue = (key: string, v: string) => {
    if (!docId) return;
    const rest = Object.entries(values ?? {}).filter(([k]) => k !== key);
    setDocumentValues(docId, Object.fromEntries(v ? [...rest, [key, v]] : rest));
  };
  const variableField = (n: string) => {
    const key = n.toLowerCase();
    const field = job && (ownValue(JOB_FIELD, key) as (typeof JOB_FIELD)[string] | undefined);
    if (job && field)
      return (
        <HdsInput
          key={key}
          label={n}
          value={job[field] ?? ''}
          placeholder={ownValue(values, key) || 'Not set'}
          onChange={(e) => updateJob(job.url, { [field]: e.target.value } as Partial<Job>)}
        />
      );
    const kit = key === 'your name' && kitName ? kitName : '';
    return (
      <HdsInput
        key={key}
        label={n}
        value={ownValue(values, key) ?? ''}
        placeholder={kit || 'Not set'}
        helperText={kit ? 'Empty uses your Application kit name' : undefined}
        onChange={(e) => setValue(key, e.target.value)}
      />
    );
  };

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
        <Text variant="caption" as="p" tone="secondary">
          Type a name in square brackets, like [Hiring manager], to make your own variable.
        </Text>
      </Stack>
      {actions}
      <Select
        label="Fill for"
        options={options}
        value={job ? job.url : NO_JOB}
        onChange={(v) => setFillFor(v === NO_JOB ? null : v)}
      />
      {docId && names.length > 0 && (
        <section aria-labelledby={`vars-${docId}`}>
          <Stack gap="tight">
            <Text variant="body" as="h3" id={`vars-${docId}`} className="rjb-semibold">
              Variables
            </Text>
            <Text variant="caption" as="p" tone="secondary">
              {job
                ? 'Company, Role, Contact and Angle are saved on this job; the rest on this message.'
                : 'Saved on this message. Pick a job to fill its company, role, contact and angle.'}
            </Text>
            {names.map(variableField)}
          </Stack>
        </section>
      )}
      <Surface padding="px16" role="region" aria-label="Preview">
        <Text variant="body" as="p" style={PRE}>
          {filled || 'Nothing to preview yet.'}
        </Text>
      </Surface>
      {missing.length > 0 && (
        <Text variant="caption" as="p" tone="secondary">
          {job
            ? `Still unfilled for this job: ${missing.join(', ')}. Set them under Variables, or edit after pasting.`
            : `Not set yet: ${missing.join(', ')}. Set them under Variables, or pick a job.`}
        </Text>
      )}
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
