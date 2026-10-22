// One Base document in the library (#227): its title, its text and its Version history. The text
// is a draft until Save, and each Save adds a Version (documents.saveVersion), so earlier text
// stays readable and can be brought back into the draft. A new document has no id until its first
// Save creates it. Outreach messages keep the Templates editor's tools: variable chips and the
// Insert variable menu over HDS TokenField (each [Name] one atomic chip), and the Variables panel
// (#221): Fill for a job, then each variable (a picked job's four fields saved on the job, every
// other value on the message, `Document.values`, not a Version), and the preview filled through
// templateFill.fillSnippet (job fields, then the message's own values, then the kit name). Layout
// is the rev-3 mock's editor (slice 3): the document's title as the page head, Save, Version
// history and the menu in one row. Delete sits in the menu and asks first. Unsaved text is never
// lost without a word (QA): All documents asks first, a reload warns, and a draft left by the
// browser's Back is kept for the tab (docDrafts) and brought back with a notice.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Ellipsis, Plus } from 'lucide-react';
import {
  AlertDialog,
  Button,
  Box,
  Icon,
  Input as HdsInput,
  Menu,
  Select,
  Stack,
  Surface,
  Tag,
  Text,
  Textarea,
  TokenField,
  Tooltip as HdsTooltip,
  useToast,
} from '@hirobius/design-system';
import {
  createDocument,
  DOCUMENT_KINDS,
  getAllDocuments,
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
import { fillSnippet, ownValue } from './templateFill';
import { insertToken, templateVariables, TOKEN_CHIPS } from './templateEditor';
import type { TokenFieldHandle } from '@hirobius/design-system';
import { JOB_FIELD } from './fillBlank';
import { Panel, PanelBody } from './PipelinePanel';
import { copyFilled } from './templateCopy';
import { metaLines } from './metaLines';
import { BlanksLeft, WithChips } from './BlankText';
import { dropDocDraft, keepDocDraft, readDocDraft } from './docDrafts';
import { scrollToTop } from './scrollMemory';
import { BackGuard } from './back';

const NO_JOB = 'none';
const FULL = { width: '100%' } as const;
const PRE = { margin: 0, whiteSpace: 'pre-wrap' } as const;
const LIST = { listStyle: 'none', margin: 0, padding: 0 } as const;
const versionsLabel = (n: number) => (n === 1 ? '1 version' : `${n} versions`);

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
  back,
  returnTo,
}: {
  /** The document to edit; left out for a new one, which is created on its first Save. */
  doc?: Document;
  kind: DocumentKind;
  onBack: () => void;
  onCreated: (id: string) => void;
  /** The page's Back in place of "All documents" (return paths: it names a job or Apply mode). */
  back?: ReactNode;
  /** Opened from a job or Apply mode (return paths): a Save goes straight back there, and the
   *  toast says so. */
  returnTo?: { label: string; go: () => void };
}) {
  const { toast } = useToast();
  const label = labelOf(kind);
  const saved = doc ? doc.versions[doc.versions.length - 1].text : '';
  const docId = doc?.id;
  const [title, setTitle] = useState(doc ? doc.title : '');
  // A draft this tab left unsaved (the browser's Back took the editor away) comes back.
  const [restored] = useState(() => {
    const kept = docId ? readDocDraft(docId) : null;
    return kept != null && kept !== saved ? kept : null;
  });
  const [draft, setDraft] = useState(restored ?? saved);
  // A newer Version synced in: an untouched draft follows it, so Save never re-saves older text.
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    if (draft === seen) setDraft(saved);
    setSeen(saved);
  }
  const [confirming, setConfirming] = useState(false);
  // Opened from a scrolled list, the editor starts at its head (like JobPage and ApplyMode).
  useEffect(() => {
    scrollToTop();
  }, [doc?.id, kind]);
  const outreach = kind === 'outreach';
  const dirty = doc ? draft !== saved : true;
  // Text that would be lost on leaving: an edit not yet saved as a Version, or a new document
  // with something in it.
  const unsaved = doc ? draft !== saved : draft.trim() !== '' || title.trim() !== '';

  // Keep the draft for the tab while it differs from the latest Version; drop it once they match.
  useEffect(() => {
    if (!docId) return;
    if (draft !== saved) keepDocDraft(docId, draft);
    else dropDocDraft(docId);
  }, [docId, draft, saved]);
  // A reload or a closed tab asks while there is unsaved text.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
  // Say so when a kept draft came back, with a way to drop it. Once per opening (StrictMode runs
  // effects twice).
  const told = useRef(false);
  useEffect(() => {
    if (restored == null || !docId || told.current) return;
    told.current = true;
    toast({
      title: 'Restored unsaved changes',
      description: 'Save to keep them.',
      actions: [
        {
          label: 'Discard',
          onSelect: () => {
            const latest = getAllDocuments().find((d) => d.id === docId);
            if (latest) setDraft(latest.versions[latest.versions.length - 1].text);
          },
        },
      ],
    });
  }, [restored, docId, toast]);
  const [leaving, setLeaving] = useState(false);
  // Where Discard goes: the Back that asked (a named origin, return paths), else All documents.
  const pendingBack = useRef<(() => void) | null>(null);
  const guardBack = (go: () => void) => {
    if (!unsaved) return go();
    pendingBack.current = go;
    setLeaving(true);
  };
  const leave = () => guardBack(onBack);
  const discard = () => {
    if (docId) dropDocDraft(docId);
    setDraft(saved);
    const go = pendingBack.current ?? onBack;
    pendingBack.current = null;
    go();
  };

  const back$ = returnTo ? `Back to ${returnTo.label}` : undefined;
  const save = () => {
    if (!doc) {
      const id = createDocument({ kind, title: title.trim() || label, text: draft, base: true });
      toast({ title: 'Saved', description: back$ ?? (title.trim() || label), tone: 'success' });
      if (returnTo) returnTo.go();
      else onCreated(id);
      return;
    }
    if (saveVersion(doc.id, draft)) {
      toast({
        title: `Saved as version ${doc.versions.length + 1}`,
        tone: 'success',
        ...(back$ ? { description: back$ } : {}),
      });
      returnTo?.go();
    }
  };
  const commitTitle = () => {
    if (doc && title.trim() !== doc.title) renameDocument(doc.id, title);
  };

  const [history, setHistory] = useState(false);

  // Save, Version history and the menu in one row, right under the text (rev-3 mock).
  const actions = (
    <Stack direction="row" gap="tight" align="center" wrap="wrap">
      <Button variant="primary" onClick={save} disabled={!dirty}>
        Save
      </Button>
      {doc && (
        <Button
          variant="secondary"
          aria-expanded={history}
          aria-controls={`history-${doc.id}`}
          onClick={() => setHistory(!history)}
        >
          {`Version history (${doc.versions.length})`}
        </Button>
      )}
      {doc && (
        // Not modal: a modal menu and the confirm dialog both lock body pointer events (#132).
        <Menu modal={false}>
          <Menu.Trigger asChild>
            <Button
              variant="secondary"
              iconOnly
              iconLeft={<Icon icon={Ellipsis} />}
              label="More actions"
            />
          </Menu.Trigger>
          <Menu.Content align="end">
            <Menu.Item
              onSelect={() => {
                setDocumentPinned(doc.id, !doc.pinned);
                toast({ title: doc.pinned ? 'Unpinned' : 'Pinned', description: doc.title });
              }}
            >
              {doc.pinned ? 'Unpin' : 'Pin'}
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item onSelect={() => setConfirming(true)} tone="danger">
              Delete
            </Menu.Item>
          </Menu.Content>
        </Menu>
      )}
    </Stack>
  );

  return (
    <Stack gap="normal" className="rjb-form-full">
      <BackGuard.Provider value={guardBack}>
        {back ?? (
          <Box>
            <Button
              variant="tertiary"
              className="rjb-back"
              iconLeft={<Icon icon={ArrowLeft} />}
              onClick={leave}
            >
              All documents
            </Button>
          </Box>
        )}
      </BackGuard.Provider>
      <Stack gap="px4">
        <Text variant="title" as="h2">
          {doc ? doc.title || 'Untitled' : `New ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
        </Text>
        <Text variant="caption" as="p" tone="secondary">
          {/* Two items at most on a meta line (#192): every document here is a Base one. */}
          {metaLines([label, doc ? versionsLabel(doc.versions.length) : 'Base'])[0]}
        </Text>
      </Stack>
      <HdsInput
        label="Title"
        value={title}
        placeholder={doc ? 'Untitled' : label}
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
          history={doc && history ? <VersionHistory doc={doc} onUse={setDraft} /> : null}
        />
      ) : (
        <>
          <Textarea
            label="Text"
            rows={12}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={FULL}
          />
          {actions}
          {doc && history && <VersionHistory doc={doc} onUse={setDraft} />}
        </>
      )}
      {/* Leaving with unsaved text (QA): Keep editing is the default (Radix focuses Cancel). */}
      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>Discard changes?</AlertDialog.Title>
            <AlertDialog.Description>
              {doc
                ? 'Your changes since the last Save will be lost.'
                : 'This new document will be lost.'}
            </AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Keep editing</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button tone="danger" onClick={discard}>
                Discard
              </Button>
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
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
                  variant="secondary"
                  tone="danger"
                  onClick={() => {
                    if (removeDocument(doc.id)) {
                      dropDocDraft(doc.id);
                      onBack();
                    } else
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

/** An Outreach message's text: variable chips + Insert variable over the TokenField, then the
 *  Variables panel (Fill for a job, each variable, the filled preview with Copy). */
function OutreachText({
  value,
  onChange,
  docId,
  values,
  actions,
  history,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Save, Version history and the menu, right under the text. */
  actions: ReactNode;
  /** The open Version history, under the actions. */
  history: ReactNode;
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
        placeholder={kit || (key === 'your name' ? 'From your kit' : 'Not set')}
        helperText={kit ? 'Empty uses your Application kit name' : undefined}
        onChange={(e) => setValue(key, e.target.value)}
      />
    );
  };

  const area = useRef<TokenFieldHandle>(null);
  // The caret to set once an inserted chip has rendered.
  const caret = useRef<number | null>(null);
  useEffect(() => {
    const at = caret.current;
    if (at == null) return;
    caret.current = null;
    // A frame later: the Insert variable menu is still closing and would take focus back.
    const frame = requestAnimationFrame(() => area.current?.setSelection(at));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  const insert = (token: string) => {
    const sel = area.current?.getSelection();
    const r = insertToken(value, sel?.start ?? null, sel?.end ?? null, token);
    caret.current = r.caret;
    onChange(r.value);
  };
  const copy = async () => {
    const r = await copyFilled(filled);
    if (r.ok) toast({ title: 'Copied', tone: 'success' });
    else toast({ title: "Couldn't copy", description: r.reason, tone: 'danger' });
  };
  const options = [
    { value: NO_JOB, label: 'No job' },
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
                <Tag onClick={() => insert(c.token)}>{c.token.slice(1, -1)}</Tag>
              </HdsTooltip.Trigger>
              <HdsTooltip.Content>{c.hint}</HdsTooltip.Content>
            </HdsTooltip>
          ))}
          <Menu>
            <Menu.Trigger asChild>
              {/* A chip like the variables beside it (rev-3 mock). */}
              <Tag>
                <Stack as="span" direction="row" gap="px4" align="center">
                  <Icon icon={Plus} size="small" />
                  Insert variable
                </Stack>
              </Tag>
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
        <TokenField
          ref={area}
          aria-label="Message text"
          rows={8}
          value={value}
          placeholder="Paste or write your message…"
          onChange={onChange}
          helperText="Type a name in square brackets, like [Hiring manager], to make your own variable."
        />
      </Stack>
      {actions}
      {history}
      <Panel
        label={docId ? 'Variables' : 'Fill for a job'}
        title={docId ? 'Variables' : 'Fill for a job'}
      >
        <PanelBody>
          <Stack gap="normal" className="rjb-form-full">
            {docId && names.length > 0 && (
              <Text variant="caption" as="p" tone="secondary">
                {job
                  ? 'Company, Role, Contact and Angle are saved on this job; the rest on this message.'
                  : 'Pick a job to fill Company, Role, Contact and Angle. The rest saves on this message.'}
              </Text>
            )}
            <Select
              label="Fill for"
              options={options}
              value={job ? job.url : NO_JOB}
              onChange={(v) => setFillFor(v === NO_JOB ? null : v)}
            />
            {docId && names.map(variableField)}
            {/* rev-3 A: open blanks are chips and "N blanks left", never raw [Brackets]. A boxed
                preview, named on screen, lined up with the fields above it. */}
            <Stack gap="px4">
              <Text variant="caption" as="p" tone="secondary">
                Preview
              </Text>
              <Box
                role="region"
                aria-label="Preview"
                sx={{
                  border: 'thin solid',
                  borderColor: 'border.default',
                  borderRadius: 'md',
                  bgcolor: 'var(--semantic-color-surface-sunken)',
                  p: 'sm',
                }}
              >
                <Text variant="body" as="p" style={PRE}>
                  {filled ? <WithChips text={filled} /> : 'Nothing to preview yet.'}
                </Text>
              </Box>
            </Stack>
            <BlanksLeft text={filled} />
            <Box>
              <Button variant="secondary" onClick={copy}>
                Copy filled text
              </Button>
            </Box>
          </Stack>
        </PanelBody>
      </Panel>
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
    <Surface padding="px16" id={`history-${doc.id}`} role="region" aria-label="Version history">
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
    </Surface>
  );
}
