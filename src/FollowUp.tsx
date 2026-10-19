// The follow-up flow (2026-10-17). Every "Follow up" button (the Follow up section, a Pipeline row, the job page
// header) opens this one dialog: the follow-up template filled from the job, editable, with Copy
// message → Mark as sent (undoable) and a quiet Snooze. Only Mark as sent and Snooze change the
// job; closing changes nothing. The host is mounted once in App, so a row that leaves its list
// once the follow-up is sent doesn't take the dialog with it.
import { useState } from 'react';
import { Alert, Button, Dialog, Stack, Text, Textarea, useToast } from '@hirobius/design-system';
import { useSnippets } from './copyDeckStore';
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
import { fillSnippet, unfilledTokens } from './templateFill';
import { useApplyKit } from './applyKit';
import type { Job } from './types';
import { SECONDARY } from './hds-gaps/tone';

type Size = 'sm' | 'md';

/** The button that opens the follow-up dialog for a job. */
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
  return (
    <Dialog open={!!job} onOpenChange={(o) => !o && closeFollowUp()}>
      {job && <FollowUpContent key={job.url} job={job} />}
    </Dialog>
  );
}

function FollowUpContent({ job }: { job: Job }) {
  const snippets = useSnippets();
  const { toast } = useToast();
  const template = pickFollowUpTemplate(snippets);
  const kitName = useApplyKit().fields.name;
  // Filled once on open (the one fill path, templateFill.fillSnippet); after that the text is the
  // user's to edit.
  const [message, setMessage] = useState(() =>
    template ? fillSnippet(template, job, kitName) : '',
  );
  const [copied, setCopied] = useState(false);
  // The job's follow-up clock before Mark as sent, for Undo. Set means "sent".
  const [sent, setSent] = useState<Pick<Job, 'followUp' | 'snoozeUntil'> | null>(null);
  const missing = unfilledTokens(message);
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
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title>Follow up</Dialog.Title>
        <Dialog.Description>
          {job.company ? `${title} at ${job.company}` : title}
        </Dialog.Description>
      </Dialog.Header>
      {sent ? (
        <Alert tone="success">{`Follow-up sent. Next one due in ${FOLLOWUP_DAYS} days.`}</Alert>
      ) : (
        <Stack gap="tight">
          <Textarea
            label="Message"
            rows={10}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setCopied(false); // an edit needs copying again
            }}
          />
          {!template && (
            <Text variant="caption" style={SECONDARY}>
              No follow-up template yet. Write it here, or add one in Templates.
            </Text>
          )}
          {missing.length > 0 && (
            <Text variant="caption" style={SECONDARY}>
              Still to fill in: {missing.map((t) => `[${t}]`).join(', ')}.
            </Text>
          )}
          <div>
            <Button asChild variant="tertiary" size="sm">
              <a href={job.url} target="_blank" rel="noopener noreferrer">
                Open job posting
              </a>
            </Button>
          </div>
        </Stack>
      )}
      <Dialog.Footer>
        {sent ? (
          <>
            <Button variant="secondary" onClick={undo}>
              Undo
            </Button>
            <Button onClick={closeFollowUp}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="tertiary" onClick={snooze}>
              {`Snooze ${SNOOZE_DAYS} days`}
            </Button>
            {copied ? (
              <>
                <Button variant="secondary" onClick={copy}>
                  Copy again
                </Button>
                <Button onClick={markSent}>Mark as sent</Button>
              </>
            ) : (
              <Button onClick={copy}>Copy message</Button>
            )}
          </>
        )}
      </Dialog.Footer>
    </Dialog.Content>
  );
}
