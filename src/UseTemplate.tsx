import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Input, Stack, Tag, Text, Textarea } from '@hirobius/design-system';
import { Sheet } from './Sheet';
import { useSnippets } from './copyDeckStore';
import { fillTemplate, unfilledTokens, valuesFromJob } from './templateFill';
import type { Job } from './types';

const muted = { color: 'var(--semantic-color-content-secondary)' } as const;

interface SheetProps {
  job: Job;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Fill a Copy Deck template from a job and copy it. A token the job has no value for gets an
 *  inline field; what you type fills the copy (it is not written back to the job). */
export function UseTemplateSheet({ job, open, onOpenChange }: SheetProps) {
  const snippets = useSnippets();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  const ordered = useMemo(
    () => [...snippets.filter((s) => s.pinned), ...snippets.filter((s) => !s.pinned)],
    [snippets],
  );
  const picked = ordered.find((s) => s.id === pickedId) ?? ordered[0];
  const base = valuesFromJob(job);
  // Tokens the job itself cannot fill — these keep their field while you type into it.
  const missing = picked ? unfilledTokens(fillTemplate(picked.body, base)) : [];
  const values = { ...base };
  for (const tok of missing) {
    const v = typed[tok.toLowerCase()]?.trim();
    if (v) values[tok.toLowerCase() as keyof typeof values] = v;
  }
  const filled = picked ? fillTemplate(picked.body, values) : '';

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
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setCopied(false);
          setTyped({});
        }
      }}
      title="Use a template"
      description="Pick a template to fill with this job's details, then copy it."
      footer={
        <Button variant="primary" onClick={copy} disabled={!picked}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      }
    >
      {ordered.length === 0 ? (
        <Text variant="body" as="p" style={muted}>
          Your Copy Deck is empty. Add a template there first.
        </Text>
      ) : (
        <Stack gap="normal">
          <Box
            role="group"
            aria-label="Templates"
            sx={{ display: 'flex', flexWrap: 'wrap', gap: 'xs' }}
          >
            {ordered.map((s) => (
              <Tag
                key={s.id}
                active={s.id === picked?.id}
                aria-pressed={s.id === picked?.id}
                onClick={() => {
                  setPickedId(s.id);
                  setCopied(false);
                }}
              >
                {s.label}
              </Tag>
            ))}
          </Box>
          <Textarea
            readOnly
            rows={10}
            aria-label="Preview"
            value={filled}
            style={{ width: '100%' }}
          />
          {missing.map((tok) => (
            <Input
              key={tok}
              label={`${tok} is missing`}
              placeholder={`Add ${tok.toLowerCase()}`}
              value={typed[tok.toLowerCase()] ?? ''}
              onChange={(e) => {
                setTyped((t) => ({ ...t, [tok.toLowerCase()]: e.target.value }));
                setCopied(false);
              }}
              style={{ width: '100%' }}
            />
          ))}
        </Stack>
      )}
    </Sheet>
  );
}
