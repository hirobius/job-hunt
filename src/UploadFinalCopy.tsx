// Final copies (#231): upload the PDF/Word file that actually went out for a Job, optionally marked
// Sent, then download it back or remove it (refused once Sent, like every Sent Document). The file
// is kept in the synced blob (see the storage note in documents.ts), so the caps are small and the
// errors name them. Mounted on the job page's Documents tab by JobFinalCopies.tsx.
import { useRef, useState, type ChangeEvent } from 'react';
import { Alert, Badge, Button, Checkbox, Select, Stack, Text } from '@hirobius/design-system';
import {
  addFinalCopy,
  DOCUMENT_KINDS,
  finalFileBlob,
  formatBytes,
  getAllDocuments,
  isFinalCopy,
  markSent,
  readFinalFile,
  removeDocument,
  uploadedBytes,
  uploadError,
  UPLOAD_MAX_BYTES,
  useDocuments,
  type DocumentKind,
} from './documents';
import { dedupKey } from './store';
import { download } from './download';
import { SECONDARY } from './hds-gaps/tone';

const KIND_OPTIONS = DOCUMENT_KINDS.map((k) => ({ value: k.kind, label: k.label }));
const kindLabel = (k: DocumentKind) => DOCUMENT_KINDS.find((x) => x.kind === k)?.label ?? k;
const ACCEPT =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const LIST_RESET = { listStyle: 'none', margin: 0, padding: 0 } as const;

export function UploadFinalCopy({
  jobUrl,
  heading = true,
}: {
  jobUrl: string;
  /** Show the "Upload a final copy" head; off where a disclosure already says it. */
  heading?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKind>('cover');
  const [picked, setPicked] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    e.target.value = '';
    setDone('');
    setPicked(f);
    setError(f ? uploadError(f, uploadedBytes(getAllDocuments())) : null);
  };

  const upload = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const r = addFinalCopy({ kind, jobUrl, file: await readFinalFile(picked) });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      let msg = `Uploaded ${picked.name}.`;
      if (sent) {
        msg =
          markSent(r.id, r.versionId) === 'sent'
            ? `Uploaded ${picked.name}, marked Sent.`
            : `Uploaded ${picked.name}. Not marked Sent: this job already has a Sent ${kindLabel(kind).toLowerCase()}.`;
      }
      setDone(msg);
      setPicked(null);
      setSent(false);
    } catch {
      setError('That file could not be read. Try choosing it again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="normal">
      <Stack gap="tight">
        {heading && (
          <Text variant="body" className="rjb-semibold">
            Upload a final copy
          </Text>
        )}
        <Text variant="caption" style={SECONDARY}>
          PDF or Word, up to {formatBytes(UPLOAD_MAX_BYTES)}. Kept with your saved data, never
          behind a public link.
        </Text>
      </Stack>
      <Select
        label="Kind"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(v) => setKind(v as DocumentKind)}
      />
      <Stack direction="row" gap="tight" align="center" wrap="wrap">
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          Choose file
        </Button>
        <Text variant="ui" style={picked ? undefined : SECONDARY}>
          {picked ? `${picked.name} · ${formatBytes(picked.size)}` : 'No file chosen'}
        </Text>
      </Stack>
      {/* HDS has no file picker; a hidden native input behind "Choose file" is the gap. */}
      {/* eslint-disable-next-line hds/no-raw-controls */}
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        aria-label="Choose a file to upload"
        hidden
        onChange={onFile}
      />
      {error && <Alert tone="danger">{error}</Alert>}
      <Checkbox label="Mark as Sent" checked={sent} onChange={setSent} />
      <Stack direction="row" gap="tight" align="center" wrap="wrap">
        <Button
          variant="secondary"
          size="sm"
          disabled={!picked || !!error || busy}
          onClick={() => void upload()}
        >
          Upload
        </Button>
        <div aria-live="polite">{done && <Text variant="ui">{done}</Text>}</div>
      </Stack>
    </Stack>
  );
}

/** This job's final copies: download each back; remove one that is not Sent. */
export function FinalCopies({ jobUrl }: { jobUrl: string }) {
  const key = dedupKey(jobUrl);
  const copies = useDocuments().filter(
    (d) => isFinalCopy(d) && d.jobUrl && dedupKey(d.jobUrl) === key,
  );
  if (!copies.length) return null;

  return (
    <Stack gap="tight" as="ul" style={LIST_RESET}>
      {copies.map((d) => {
        const v = d.versions.find((x) => x.file)!;
        const file = v.file!;
        const isSent = d.versions.some((x) => x.sentAt);
        return (
          <li key={d.id}>
            <Stack direction="row" gap="tight" align="center" wrap="wrap">
              <Stack gap="hairline">
                <Text variant="ui">{file.name}</Text>
                <Text variant="caption" style={SECONDARY}>
                  {kindLabel(d.kind)} · {formatBytes(file.size)}
                </Text>
              </Stack>
              {isSent && <Badge tone="success">Sent</Badge>}
              <Button
                variant="tertiary"
                size="sm"
                aria-label={`Download ${file.name}`}
                onClick={() => download(file.name, finalFileBlob(file))}
              >
                Download
              </Button>
              {!isSent && (
                <Button
                  variant="tertiary"
                  size="sm"
                  tone="danger"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => removeDocument(d.id)}
                >
                  Remove
                </Button>
              )}
            </Stack>
          </li>
        );
      })}
    </Stack>
  );
}
