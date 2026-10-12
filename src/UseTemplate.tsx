import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, Textarea } from '@hirobius/design-system';
import { useSnippets } from './copyDeckStore';
import { fillTemplate, unfilledTokens, valuesFromJob } from './templateFill';
import type { Job } from './types';

// Fill a Copy Deck snippet from a job's company/role/contact/angle and copy it.
export default function UseTemplate({ job }: { job: Job }) {
  const snippets = useSnippets();
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const ordered = useMemo(
    () => [...snippets.filter((s) => s.pinned), ...snippets.filter((s) => !s.pinned)],
    [snippets],
  );
  const picked = ordered.find((s) => s.id === pickedId) ?? ordered[0];
  const filled = picked ? fillTemplate(picked.body, valuesFromJob(job)) : '';
  const missing = unfilledTokens(filled);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(filled);
      setCopied(true);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setCopied(false);
      }}
    >
      <Button size="sm" variant="tertiary" onClick={() => setOpen(true)}>
        Use template
      </Button>
      <Dialog.Content style={{ width: '100%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto' }}>
        <Dialog.Header>
          <Dialog.Title>Use a template</Dialog.Title>
          <Dialog.Description>
            Pick a snippet to fill in with this job's details, then copy it.
          </Dialog.Description>
        </Dialog.Header>
        {ordered.length === 0 ? (
          <p style={{ color: 'var(--semantic-color-text-secondary)' }}>
            Your Copy Deck is empty. Add a snippet there first.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div role="group" aria-label="Templates" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
            </div>
            <Textarea readOnly rows={12} aria-label="Preview" value={filled} style={{ width: '100%' }} />
            {missing.length > 0 && (
              <p style={{ margin: 0, color: 'var(--semantic-color-text-secondary)' }}>
                Still unfilled: {missing.map((t) => `[${t}]`).join(', ')}. Add them on the job, or edit after pasting.
              </p>
            )}
          </div>
        )}
        <Dialog.Footer>
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
