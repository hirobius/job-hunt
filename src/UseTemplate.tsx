import { useEffect, useState } from 'react';
import { Check, Copy, FileText, Pencil } from 'lucide-react';
import {
  Box,
  Button,
  Dialog,
  Icon,
  Card,
  Tag,
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
      {/* HDS Dialog sizing, the page's 16px gutter at 390 and a scrolling body under a pinned
          header and footer: the shared rjb-dialog classes, the same as Follow up. */}
      <Dialog.Content className="rjb-dialog">
        <Dialog.Header>
          <Dialog.Title>Use a template</Dialog.Title>
          <Dialog.Description>
            Pick a message to fill in with this job's details, then copy it.
          </Dialog.Description>
        </Dialog.Header>
        <div className="rjb-dialog-body">
          {ordered.length === 0 ? (
            <Text variant="caption" as="p" tone="secondary">
              No outreach messages yet. Write one in Documents first.
            </Text>
          ) : (
            <Stack gap="normal">
              {/* The messages as HDS toggle chips (Tag: aria-pressed, the active pill marks the
                  pick), pinned first as outreachTemplates orders them. Never a primary, so Copy
                  message stays the one (rev-3 A). A Menu isn't used here: HDS Menu and Dialog
                  carry separate Radix layer copies, so a menu in the dialog closes both on Escape. */}
              <div role="group" aria-label="Templates">
                <Stack direction="row" gap="px8" wrap="wrap">
                  {ordered.map((s) => (
                    <Tag
                      key={s.id}
                      active={s.id === picked?.id}
                      onClick={() => {
                        setPickedId(s.id);
                        setCopied(false);
                      }}
                    >
                      {s.label}
                    </Tag>
                  ))}
                </Stack>
              </div>
              {/* The filled message with its blanks as chips that fill in place (rev-3 A), then
                  "N blanks left" and Edit message as the card's last row; Copy still works. */}
              <Card bordered padding="px16" role="region" aria-label="Preview">
                <BlankText
                  text={filled}
                  job={job}
                  documentId={picked?.documentId}
                  trailing={
                    picked && (
                      // HDS Button asChild drops iconLeft, so the pencil is the link's own child.
                      <Button asChild variant="tertiary" size="md">
                        <a href={documentHref(picked.documentId)}>
                          <Icon icon={Pencil} />
                          Edit message
                        </a>
                      </Button>
                    )
                  }
                />
              </Card>
            </Stack>
          )}
        </div>
        {/* One primary (rev-3 A); the header X closes the sheet. */}
        <Dialog.Footer>
          {/* Rule A, as in Follow up: one full-width primary (Copy message), pinned under the
              scrolling body; the dialog's X is the one Close. */}
          <Box sx={{ flex: '1 1 auto', display: 'flex', '& > *': { flex: '1 1 0%' } }}>
            <Button
              variant="primary"
              iconLeft={<Icon icon={copied ? Check : Copy} />}
              onClick={copy}
              disabled={!picked}
            >
              {copied ? 'Copied' : 'Copy message'}
            </Button>
          </Box>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
