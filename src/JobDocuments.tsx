// The job page's Documents tab (#228, epic #225): the Job's Résumés, Cover letters, Notes and
// Outreach messages, grouped by kind. Each document shows its latest text to edit (every save adds
// a Version) and its Version history. "Use a Base document" copies one into the Job as a new,
// independent document. One Version per kind per Job can be marked Sent: it asks first, then that
// Version is locked and labelled, and the document can no longer be deleted. A refused mark (the
// kind was sent from another device meanwhile) is said in an Alert. The integrator adds a
// per-Version control (Download PDF / Word) through `versionActions` and the final copies (#231)
// through `uploadSlot`, shown at the foot of the tab. A final copy (an uploaded file) is never a
// text card here, but it counts for the one-Sent-per-kind lock.
import { useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import {
  Alert,
  AlertDialog,
  Badge,
  Box,
  Button,
  Disclosure,
  Input,
  Select,
  Stack,
  Switcher,
  Text,
  Textarea,
} from '@hirobius/design-system';
import { EmptyState } from './hds-gaps/EmptyState';
import {
  createDocument,
  DOCUMENT_KINDS,
  isFinalCopy,
  markSent,
  removeDocument,
  saveVersion,
  useDocuments,
  type Document,
  type DocumentKind,
  type Version,
} from './documents';
import {
  baseDocuments,
  copyBase,
  documentsByKind,
  documentsForJob,
  kindLabel,
  latestVersion,
  markSentMessage,
  sentByKind,
  type SentVersion,
} from './jobDocuments';
import type { Job } from './types';

export interface JobDocumentsProps {
  job: Job;
  /** A control for one Version (the integrator's Download PDF / Word), shown on its row. */
  versionActions?: (doc: Document, version: Version) => ReactNode;
  /** A section for the whole tab (the final copies and their upload), at the foot of the tab. */
  uploadSlot?: ReactNode;
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** A refused action, said in the tab's Alert. */
type Message = { title: string; text: string };

/** A surface inside the Documents card: a well (roomy: a fill step, not an outline). */
const WELL = { bgcolor: 'surface.overlay', borderRadius: 'sm', p: 'fixed-sm' } as const;

/** Fill the column: HDS fields size to their content otherwise. */
const FULL = { flex: 1, minWidth: 0, '& > *': { width: '100%' } } as const;

function NewDocumentForm({ job, onDone }: { job: Job; onDone: () => void }) {
  const [kind, setKind] = useState<DocumentKind>('resume');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  return (
    <Box sx={WELL}>
      <Stack gap="normal">
        <Switcher gap="tight">
          <Box sx={FULL}>
            <Select
              label="Kind"
              options={DOCUMENT_KINDS.map((k) => ({ value: k.kind, label: k.label }))}
              value={kind}
              onChange={(v) => setKind(v as DocumentKind)}
            />
          </Box>
          <Box sx={FULL}>
            <Input
              label="Title"
              placeholder={kindLabel(kind)}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Box>
        </Switcher>
        <Box sx={FULL}>
          <Textarea label="Text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        </Box>
        <Stack direction="row" gap="tight" justify="end" wrap="wrap">
          <Button size="md" variant="tertiary" onClick={onDone}>
            Cancel
          </Button>
          <Button
            size="md"
            variant="tertiary"
            onClick={() => {
              createDocument({
                kind,
                title: title.trim() || kindLabel(kind),
                text,
                jobUrl: job.url,
                company: job.company,
              });
              onDone();
            }}
          >
            Create
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

function UseBaseForm({ job, bases, onDone }: { job: Job; bases: Document[]; onDone: () => void }) {
  const [id, setId] = useState(bases[0]?.id ?? '');
  const base = bases.find((b) => b.id === id);
  return (
    <Box sx={WELL}>
      <Stack gap="normal">
        <Box sx={FULL}>
          <Select
            label="Base document"
            options={bases.map((b) => ({
              value: b.id,
              label: `${b.title || kindLabel(b.kind)} · ${kindLabel(b.kind)}`,
            }))}
            value={id}
            onChange={setId}
          />
        </Box>
        <Text variant="caption" as="p" tone="secondary">
          The copy is this job’s own: editing it never changes the Base document, and the other way
          round.
        </Text>
        <Stack direction="row" gap="tight" justify="end" wrap="wrap">
          <Button size="md" variant="tertiary" onClick={onDone}>
            Cancel
          </Button>
          <Button
            size="md"
            variant="tertiary"
            disabled={!base}
            onClick={() => {
              if (base) createDocument(copyBase(base, job));
              onDone();
            }}
          >
            Copy into this job
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

function VersionRow({
  doc,
  version,
  number,
  canSend,
  onSend,
  actions,
}: {
  doc: Document;
  version: Version;
  number: number;
  canSend: boolean;
  onSend: () => void;
  actions?: ReactNode;
}) {
  return (
    <Stack as="li" gap="tight">
      {/* The actions always sit under the label, so rows with and without a Sent badge match. */}
      <Stack gap="tight" align="start">
        <Stack direction="row" gap="tight" align="center" wrap="wrap">
          <Text variant="ui" as="span">
            {`Version ${number} · ${when(version.savedAt)}`}
          </Text>
          {version.sentAt && <Badge tone="success">Sent</Badge>}
          {version.sentAt && (
            <Text variant="caption" as="span" tone="secondary">
              {`Locked, sent ${when(version.sentAt)}`}
            </Text>
          )}
        </Stack>
        <Stack direction="row" gap="tight" align="center" wrap="wrap">
          {canSend && !version.sentAt && (
            <Button size="sm" variant="tertiary" onClick={onSend}>
              Mark as Sent
            </Button>
          )}
          {actions}
        </Stack>
      </Stack>
      <Box sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        <Text variant="caption" as="p" tone="secondary">
          {version.text || `(empty ${kindLabel(doc.kind).toLowerCase()})`}
        </Text>
      </Box>
    </Stack>
  );
}

function DocumentCard({
  doc,
  kindSent,
  versionActions,
  onMessage,
}: {
  doc: Document;
  /** The Sent Version of this kind for the Job, if any (on this document or another). */
  kindSent?: SentVersion;
  versionActions?: JobDocumentsProps['versionActions'];
  onMessage: (msg: Message | null) => void;
}) {
  const latest = latestVersion(doc);
  const [draft, setDraft] = useState(latest.text);
  // A newer Version can arrive from another device: an untouched draft follows it, so Save never
  // re-saves the older text over it.
  const [seen, setSeen] = useState(latest.text);
  if (seen !== latest.text) {
    if (draft === seen) setDraft(latest.text);
    setSeen(latest.text);
  }
  const [sending, setSending] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const headingId = `doc-${doc.id}`;
  const sentHere = kindSent?.doc.id === doc.id;
  const label = kindLabel(doc.kind);

  return (
    <Box sx={WELL}>
      <section aria-labelledby={headingId}>
        <Stack gap="normal">
          <Stack direction="row" gap="tight" align="center" justify="space-between" wrap="wrap">
            <Stack direction="row" gap="tight" align="center" wrap="wrap">
              <Text variant="ui" as="h4" id={headingId} className="rjb-semibold">
                {doc.title || label}
              </Text>
              {sentHere && <Badge tone="success">{`Sent v${kindSent.number}`}</Badge>}
            </Stack>
            {!sentHere && (
              <Button size="sm" variant="tertiary" tone="danger" onClick={() => setDeleting(true)}>
                Delete
              </Button>
            )}
          </Stack>
          <Box sx={FULL}>
            <Textarea
              label="Text"
              rows={6}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </Box>
          <Stack direction="row" gap="tight" align="center" justify="end" wrap="wrap">
            {sentHere && (
              <Text variant="caption" as="span" tone="secondary">
                Saving adds a new Version; the Sent one stays as it was.
              </Text>
            )}
            <Button
              size="md"
              variant="tertiary"
              disabled={draft === latest.text}
              onClick={() => saveVersion(doc.id, draft)}
            >
              Save version
            </Button>
          </Stack>
          <Disclosure label={`Versions (${doc.versions.length})`} variant="nav">
            <Stack gap="normal">
              {kindSent && !sentHere && (
                <Text variant="caption" as="p" tone="secondary">
                  {`This job already has a Sent ${label} (“${kindSent.doc.title || label}”, v${kindSent.number}).`}
                </Text>
              )}
              <Stack as="ol" gap="normal">
                {doc.versions.map((v, i) => (
                  <VersionRow
                    key={v.id}
                    doc={doc}
                    version={v}
                    number={i + 1}
                    canSend={!kindSent}
                    onSend={() => setSending(v.id)}
                    actions={versionActions?.(doc, v)}
                  />
                ))}
              </Stack>
            </Stack>
          </Disclosure>
        </Stack>
      </section>
      <AlertDialog open={sending !== null} onOpenChange={(o) => !o && setSending(null)}>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>Mark this version as Sent?</AlertDialog.Title>
            <AlertDialog.Description>
              {`It becomes this job’s Sent ${label} and is locked: it can't be un-sent, changed or deleted.`}
            </AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                onClick={() => {
                  if (sending) {
                    const text = markSentMessage(markSent(doc.id, sending), doc.kind);
                    onMessage(text ? { title: 'Not marked as Sent', text } : null);
                  }
                  setSending(null);
                }}
              >
                Mark as Sent
              </Button>
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialog.Content>
          <AlertDialog.Header>
            <AlertDialog.Title>{`Delete “${doc.title || label}”?`}</AlertDialog.Title>
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
                  if (!removeDocument(doc.id))
                    onMessage({
                      title: 'Not deleted',
                      text: 'A document with a Sent version is locked and can’t be deleted.',
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

export default function JobDocuments({ job, versionActions, uploadSlot }: JobDocumentsProps) {
  const all = useDocuments();
  const jobDocs = documentsForJob(all, job.url);
  const docs = jobDocs.filter((d) => !isFinalCopy(d));
  const bases = baseDocuments(all);
  const sent = sentByKind(jobDocs);
  const [form, setForm] = useState<'none' | 'new' | 'base'>('none');
  const [message, setMessage] = useState<Message | null>(null);
  const close = () => setForm('none');

  const newButton = (variant: 'primary' | 'tertiary') => (
    <Button size="md" variant={variant} onClick={() => setForm('new')}>
      New document
    </Button>
  );
  const baseButton = bases.length > 0 && (
    <Button size="md" variant="tertiary" onClick={() => setForm('base')}>
      Use a Base document
    </Button>
  );

  return (
    <Stack gap="normal">
      {message && (
        <Alert tone="warning" title={message.title}>
          <Stack gap="tight">
            <Text variant="ui" as="p">
              {message.text}
            </Text>
            <Box>
              <Button size="sm" variant="tertiary" onClick={() => setMessage(null)}>
                Dismiss
              </Button>
            </Box>
          </Stack>
        </Alert>
      )}
      {docs.length > 0 && form === 'none' && (
        <Stack direction="row" gap="tight" align="center" wrap="wrap">
          {newButton('tertiary')}
          {baseButton}
        </Stack>
      )}
      {form === 'new' && <NewDocumentForm job={job} onDone={close} />}
      {form === 'base' && <UseBaseForm job={job} bases={bases} onDone={close} />}
      {docs.length === 0 && form === 'none' && (
        <EmptyState
          centered
          icon={FileText}
          title="No documents yet"
          description="Keep the résumé, cover letter and messages you write for this job here, with every version."
          action={
            <Stack direction="row" gap="tight" justify="center" wrap="wrap">
              {newButton('primary')}
              {baseButton}
            </Stack>
          }
        />
      )}
      {documentsByKind(docs).map((g) => (
        <Stack key={g.kind} gap="tight">
          <Text variant="body" as="h3" className="rjb-semibold">
            {g.label}
          </Text>
          {g.docs.map((d) => (
            <DocumentCard
              key={d.id}
              doc={d}
              kindSent={sent.get(d.kind)}
              versionActions={versionActions}
              onMessage={setMessage}
            />
          ))}
        </Stack>
      ))}
      {uploadSlot}
    </Stack>
  );
}
