// The follow-up flow (2026-10-17). Every "Follow up" button (the Follow up section, a Pipeline row, the job page
// header) opens this one dialog: the follow-up template filled from the job, its blanks filled in
// place (rev-3 A) or the whole text edited, with Copy
// message → Mark as sent (undoable) and a quiet Snooze. Only Mark as sent and Snooze change the
// job; closing changes nothing. The host is mounted once in App, so a row that leaves its list
// once the follow-up is sent doesn't take the dialog with it.
import { useBackCloses } from './useBackCloses';
import { useRef, useState } from 'react';
import { Copy, ExternalLink, Pencil } from 'lucide-react';
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  Icon,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@hirobius/design-system';
import BlankText from './BlankText';
import { useOutreachTemplates } from './outreachTemplates';
import {
  closeFollowUp,
  openFollowUp,
  pickFollowUpTemplate,
  useFollowUpTarget,
} from './followUpFlow';
import { FOLLOWUP_DAYS, SNOOZE_DAYS } from './jobState';
import { titleOf } from './jobRow';
import { logFollowUp, restoreFollowUp, snoozeFollowUp, useJobs } from './store';
import { copyFilled } from './templateCopy';
import { fillSnippet } from './templateFill';
import { useApplyKit } from './applyKit';
import type { Job } from './types';

type Size = 'sm' | 'md';

/** The button that opens the follow-up dialog for a job. */
// Open posting is a link in Button's dress. HDS holds a button-like link to its 44px touch minimum,
// while base.css sets phone buttons to 40, so beside Snooze it stood 4px taller. Same 40 here, so
// the row of two lines up (rev-3 A).
const LINK_AS_BUTTON = { minHeight: 'var(--primitive-space-10)' } as const;

export function FollowUpButton({
  job,
  size,
  variant = 'secondary',
}: {
  job: Job;
  size?: Size;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <Button
      size={size}
      variant={variant}
      aria-label={`Follow up: ${titleOf(job)}`}
      onClick={() => openFollowUp(job.url)}
    >
      Follow up
    </Button>
  );
}

/** "Tue, Oct 20" for a local YYYY-MM-DD. */
function dayName(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** The one follow-up dialog. Mount once. */
export function FollowUpHost() {
  const url = useFollowUpTarget();
  const job = useJobs().find((j) => j.url === url);
  // The browser's Back closes the sheet and stays on the page under it (return paths).
  useBackCloses(!!job, closeFollowUp, 'follow-up');
  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && closeFollowUp()}>
      {job && <FollowUpContent key={job.url} job={job} />}
    </Dialog>
  );
}

function FollowUpContent({ job }: { job: Job }) {
  const templates = useOutreachTemplates();
  const { toast } = useToast();
  const template = pickFollowUpTemplate(templates);
  const kitName = useApplyKit().fields.name;
  // The filled template (the one fill path, templateFill.fillSnippet) refills as blanks are filled
  // in place (rev-3 A); Edit message hands the text to the user, and from then on it is theirs.
  const filled = template ? fillSnippet(template, job, kitName) : '';
  const [edited, setEdited] = useState<string | null>(template ? null : '');
  const message = edited ?? filled;
  const [copied, setCopied] = useState(false);
  // The one primary (Copy message, then Mark as sent): focus lands here once the last blank is
  // filled, not on the dialog (QA).
  const primary = useRef<HTMLButtonElement>(null);
  // The job's follow-up clock before Mark as sent, for Undo. Set means "sent".
  const [sent, setSent] = useState<Pick<Job, 'followUp' | 'snoozeUntil'> | null>(null);
  const title = titleOf(job);

  const copy = async () => {
    const r = await copyFilled(message);
    // Either way it can be sent now: a failed copy means copying by hand.
    setCopied(true);
    if (!r.ok) toast({ title: "Couldn't copy", description: r.reason, tone: 'danger' });
  };
  const markSent = () => {
    setSent({ followUp: job.followUp, snoozeUntil: job.snoozeUntil });
    logFollowUp(job.url);
  };
  const undo = () => {
    if (sent) restoreFollowUp(job.url, sent);
    setSent(null);
  };
  const snooze = () => {
    snoozeFollowUp(job.url);
    closeFollowUp();
    const d = new Date();
    d.setDate(d.getDate() + SNOOZE_DAYS);
    const pad = (n: number) => String(n).padStart(2, '0');
    toast({
      title: `Snoozed until ${dayName(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)}`,
      description: title,
      tone: 'info',
    });
  };

  return (
    // The same HDS Dialog chrome as Use template (rjb-dialog: 16px gutter at 390, the body
    // scrolls under a pinned header and footer).
    <Dialog.Content className="rjb-dialog">
      <Dialog.Header>
        <Dialog.Title>Follow up</Dialog.Title>
        <Dialog.Description>
          {job.company ? `${title} at ${job.company}` : title}
        </Dialog.Description>
      </Dialog.Header>
      <div className="rjb-dialog-body">
        {sent ? (
          <Alert tone="success">{`Follow-up sent. Next one due in ${FOLLOWUP_DAYS} days.`}</Alert>
        ) : (
          <Stack gap="tight">
            {edited === null ? (
              // The message as the template editor shows it: each blank a chip that fills in place
              // and saves where it belongs (on the job, or on the message), then "N blanks left"
              // with Edit message beside it as the card's last row (as in Use template).
              <Card bordered padding="px16" role="region" aria-label="Preview">
                <BlankText
                  text={message}
                  job={job}
                  documentId={template?.documentId}
                  nextFocus={primary}
                  trailing={
                    <Button
                      variant="tertiary"
                      size="md"
                      iconLeft={<Icon icon={Pencil} />}
                      onClick={() => setEdited(message)}
                    >
                      Edit message
                    </Button>
                  }
                />
              </Card>
            ) : (
              <Textarea
                label="Message"
                rows={10}
                value={message}
                onChange={(e) => {
                  setEdited(e.target.value);
                  setCopied(false); // an edit needs copying again
                }}
              />
            )}
            {!template && (
              <Text variant="caption" tone="secondary">
                No follow-up message yet. Write it here, or add one in Documents.
              </Text>
            )}
          </Stack>
        )}
      </div>
      <Dialog.Footer>
        {sent ? (
          <>
            <Button variant="secondary" onClick={undo}>
              Undo
            </Button>
            <Button onClick={closeFollowUp}>Done</Button>
          </>
        ) : (
          // One full-width primary (Copy, then Mark as sent), then Open posting and Snooze as
          // one row of two secondaries (rev-3 A).
          <Box sx={{ flex: '1 1 auto' }}>
            <Stack gap="tight">
              <Box sx={{ display: 'flex', '& > *': { flex: '1 1 0%' } }}>
                {copied ? (
                  <Button ref={primary} variant="primary" onClick={markSent}>
                    Mark as sent
                  </Button>
                ) : (
                  <Button
                    ref={primary}
                    variant="primary"
                    iconLeft={<Icon icon={Copy} />}
                    onClick={copy}
                  >
                    Copy message
                  </Button>
                )}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'xs' }}>
                {copied ? (
                  <Button variant="secondary" onClick={copy}>
                    Copy again
                  </Button>
                ) : (
                  <Button asChild size="md" variant="secondary" style={LINK_AS_BUTTON}>
                    <a href={job.url} target="_blank" rel="noopener noreferrer">
                      <Icon icon={ExternalLink} />
                      Open posting
                    </a>
                  </Button>
                )}
                <Button variant="secondary" onClick={snooze}>
                  {`Snooze ${SNOOZE_DAYS} days`}
                </Button>
              </Box>
            </Stack>
          </Box>
        )}
      </Dialog.Footer>
    </Dialog.Content>
  );
}
