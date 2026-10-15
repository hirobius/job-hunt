import { useState } from 'react';
import { Badge, Button, Disclosure, Stack, Text, Textarea } from '@hirobius/design-system';
import { screenJd, MAX_JD, type JdScreen } from './jdScreener';
import { suggestVerdict, verdictTone, verdictLabel, modeLabel, blockerLabel } from './screening';
import { updateJob } from './store';
import type { Job } from './types';

const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;

// Paste a job description → deterministic rules screen → one-click apply onto the job (issue #61),
// inline in the job's Screening tab (#130). No AI. The screen SUGGESTS; applying merges blockers
// with any the user already set, and the user can still edit every field afterward.
export default function JdScreenPanel({ job }: { job: Job }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<JdScreen | null>(null);
  const [open, setOpen] = useState(false);

  const run = () => setResult(screenJd(text));
  const reset = () => {
    setText('');
    setResult(null);
  };
  const apply = () => {
    if (!result) return;
    const merged = Array.from(new Set([...(job.blockers ?? []), ...result.blockers]));
    updateJob(job.url, {
      mode: result.mode ?? job.mode,
      travelPct: result.travelPct ?? job.travelPct,
      blockers: merged,
      verdict: suggestVerdict(merged),
      screenedAt: new Date().toISOString(),
    });
    reset();
    setOpen(false);
  };

  return (
    <Disclosure label="Screen a job description" variant="nav" open={open} onOpenChange={setOpen}>
      <Stack gap="normal">
        <Text variant="ui" style={SECONDARY}>
          Paste the posting. This runs local keyword rules: nothing leaves your browser, no AI.
        </Text>
        <Textarea
          label="Job description"
          rows={8}
          value={text}
          placeholder="Paste the full job description…"
          onChange={(e) => setText(e.target.value.slice(0, MAX_JD))}
          style={{ width: '100%' }}
        />

        {result && (
          <Stack gap="tight">
            <Text variant="caption" as="span" style={SECONDARY}>
              Suggested
            </Text>
            <Stack direction="row" wrap="wrap" gap="tight" align="center">
              <Badge tone={verdictTone(result.verdict)}>{verdictLabel(result.verdict)}</Badge>
              {result.mode && <Badge tone="neutral">{modeLabel(result.mode)}</Badge>}
              {result.travelPct != null && <Badge tone="neutral">{result.travelPct}% travel</Badge>}
              {result.blockers.map((b) => (
                <Badge key={b} tone="danger">
                  {blockerLabel(b)}
                </Badge>
              ))}
              {result.blockers.length === 0 && !result.mode && result.travelPct == null && (
                <Text variant="ui" style={SECONDARY}>
                  No blockers or mode detected. Looks clean.
                </Text>
              )}
            </Stack>
            {result.hits.length > 0 && (
              <Stack gap="tight" as="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {result.hits.map((h, i) => (
                  <li key={i}>
                    <Text variant="caption" as="span" style={SECONDARY}>
                      {h.tag}: “{h.evidence}”
                    </Text>
                  </li>
                ))}
              </Stack>
            )}
            <Text variant="caption" as="span" style={SECONDARY}>
              Applying merges these with any tags you’ve set; you can edit everything after.
            </Text>
          </Stack>
        )}
        <Stack direction="row" gap="tight">
          {result ? (
            <Button variant="primary" size="sm" onClick={apply}>
              Apply to this job
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={run} disabled={!text.trim()}>
              Screen
            </Button>
          )}
          {(text || result) && (
            <Button variant="tertiary" size="sm" onClick={reset}>
              Clear
            </Button>
          )}
        </Stack>
      </Stack>
    </Disclosure>
  );
}
