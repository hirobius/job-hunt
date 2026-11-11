// Add link (#540): a job with no application link gets one here. The link is checked first
// (`checkJobLink`, #593: a web address a browser can open, not another saved job's), then becomes
// the job's URL (setJobUrl), the page moves to the job's new address, "Link added" is said, and
// focus goes to the new filled key, Open application. Nothing saved, nothing said: an invalid or
// duplicate link keeps the dialog open with its own error.
import { useState } from 'react';
import { Button, Dialog, Input, Stack } from '@hirobius/design-system';
import { checkJobLink, jobIdOf, setJobUrl } from './store';
import { openJob } from './route';
import { showNotice } from './saveNotice';
import { titleOf } from './jobRow';
import { ExitButton } from './hds-gaps/ExitButton';
import { useBackCloses } from './useBackCloses';
import type { Job } from './types';

export default function AddLinkDialog({
  job,
  open,
  onOpenChange,
}: {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // The browser's Back closes it and stays on the job (return paths).
  useBackCloses(open, () => onOpenChange(false), `add-link:${job.url}`);
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const save = () => {
    const check = checkJobLink(job.url, link.trim());
    if (!check.ok) {
      setError(
        check.reason === 'duplicate'
          ? `That link is already saved: ${titleOf(check.job)}.`
          : 'That is not a web address. Paste the full link to the job posting, starting with https://.',
      );
      return;
    }
    const next = setJobUrl(job.url, check.next);
    // The store changed between the check and the write (a sync): say so, save nothing.
    if (next !== check.next) {
      setError('That link could not be saved. Try again.');
      return;
    }
    onOpenChange(false);
    openJob(jobIdOf(next), true);
    showNotice({ title: `Link added: ${titleOf(job)}`, actions: [] });
    // The keys change with the state: focus the new filled key.
    let frames = 60;
    const focusOpen = () => {
      const a = [...document.querySelectorAll<HTMLAnchorElement>('a')].find(
        (el) => el.textContent?.trim() === 'Open application',
      );
      if (a) a.focus();
      else if (frames-- > 0) requestAnimationFrame(focusOpen);
    };
    requestAnimationFrame(focusOpen);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Add the application link</Dialog.Title>
          <Dialog.Description>{titleOf(job)}</Dialog.Description>
        </Dialog.Header>
        <Stack gap="tight">
          <Input
            label="Application link"
            value={link}
            autoFocus
            error={!!error}
            errorMessage={error || undefined}
            onChange={(e) => {
              setLink(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </Stack>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <ExitButton>Cancel</ExitButton>
          </Dialog.Close>
          <Button variant="primary" disabled={!link.trim()} onClick={save}>
            Add link
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
