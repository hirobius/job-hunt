import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  Button,
  Dialog,
  Icon,
  InlineLink,
  Card,
  Stack,
  Text,
  useToast,
} from '@hirobius/design-system';
import { documentHref, useOutreachTemplates } from './outreachTemplates';
import { fillSnippet } from './templateFill';
import BlankText from './BlankText';
import { useApplyKit } from './applyKit';
import { copyFilled } from './templateCopy';
import type { Job } from './types';

// Fill an Outreach message (a Base document in the library, #227) from a job's
// company/role/contact/angle and copy it.
export default function UseTemplate({ job }: { job: Job }) {
  const templates = useOutreachTemplates();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Pinned first (outreachTemplates already orders them).
  const ordered = templates;
  const picked = ordered.find((s) => s.id === pickedId) ?? ordered[0];
  // Every job card mounts one of these — only fill while the dialog is actually open.
  const kitName = useApplyKit().fields.name;
  const filled = open && picked ? fillSnippet(picked, job, kitName) : '';

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    const r = await copyFilled(filled);
    if (r.ok) setCopied(true);
    else toast({ title: "Couldn't copy", description: r.reason, tone: 'danger' });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setCopied(false);
      }}
    >
      <Dialog.Trigger asChild>
        <Button size="md" variant="secondary" iconLeft={<Icon icon={FileText} />}>
          Use template
        </Button>
      </Dialog.Trigger>
      <Dialog.Content
        style={{ width: '100%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto' }}
      >
        <Dialog.Header>
          <Dialog.Title>Use a template</Dialog.Title>
          <Dialog.Description>
            Pick a message to fill in with this job's details, then copy it.
          </Dialog.Description>
        </Dialog.Header>
        {ordered.length === 0 ? (
          <Text variant="caption" as="p" tone="secondary">
            No outreach messages yet. Write one in Documents first.
          </Text>
        ) : (
          <Stack gap="medium">
            <div role="group" aria-label="Templates">
              <Stack direction="row" gap="px8" wrap="wrap">
                {ordered.map((s) => (
                  <Button
                    key={s.id}
                    size="sm"
                    variant={s.id === picked?.id ? 'primary' : 'secondary'}
                    aria-pressed={s.id === picked?.id}
                    onClick={() => {
                      setPickedId(s.id);
                      setCopied(false);
                    }}
                  >
                    {s.label}
                  </Button>
                ))}
              </Stack>
            </div>
            {/* The filled message with its blanks as chips that fill in place (rev-3 A), then
                "N blanks left"; Copy still works. */}
            <Card bordered padding="px16" role="region" aria-label="Preview">
              <BlankText text={filled} job={job} documentId={picked?.documentId} />
            </Card>
          </Stack>
        )}
        <Dialog.Footer>
          {picked && (
            <InlineLink href={documentHref(picked.documentId)}>Edit in Documents</InlineLink>
          )}
          <Dialog.Close asChild>
            <Button variant="secondary">Close</Button>
          </Dialog.Close>
          <Button onClick={copy} disabled={!picked}>
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
