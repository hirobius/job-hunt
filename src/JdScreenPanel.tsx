import { useId, useState } from 'react';
import { Badge, Box, Button, Stack, Text, Textarea } from '@hirobius/design-system';
import { Panel, PanelBody } from './PipelinePanel';
import { screenJd, MAX_JD, type JdScreen } from './jdScreener';
import { suggestVerdict, verdictTone, verdictLabel, modeLabel, blockerLabel } from './screening';
import { updateJob } from './store';
import type { Job } from './types';

// Paste a job description → deterministic rules screen → one-click apply onto the job (issue #61),
// inline in the job's Screening tab (#130). No AI. The screen SUGGESTS; applying merges blockers
// with any the user already set, and the user can still edit every field afterward.
export default function JdScreenPanel({ job }: { job: Job }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<JdScreen | null>(null);
  const [open, setOpen] = useState(false);
  const bodyId = useId();

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
      blockers: merged,
      verdict: suggestVerdict(merged),
      screenedAt: new Date().toISOString(),
    });
    reset();
    setOpen(false);
  };

  return (
    // A panel of its own under Fit (rev-3 mock), closed by default: the bold panel head, a helper
    // that wraps, and Open in the header; the screener opens under it.
    <Panel
      label="Screen a job description"
      title="Screen a job description"
      description="Paste the posting to get a suggested fit, mode and dealbreakers."
      trailing={
        <Button
          variant="secondary"
          size="md"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Open'}
        </Button>
      }
    >
      {open && (
        <PanelBody>
          <Box id={bodyId}>
            <Stack gap="normal">
              <Text variant="caption" as="p" tone="secondary">
                This runs local keyword rules: nothing leaves your browser, no AI.
              </Text>
              <Textarea
                label="Job description"
                rows={8}
                value={text}
                placeholder="Paste the full job description…"
                onChange={(e) => setText(e.target.value.slice(0, MAX_JD))}
              />

              {result && (
                <Stack gap="tight">
                  <Text variant="caption" as="span" tone="secondary">
                    Suggested
                  </Text>
                  <Stack direction="row" wrap="wrap" gap="tight" align="center">
                    <Badge tone={verdictTone(result.verdict)}>{verdictLabel(result.verdict)}</Badge>
                    {result.mode && <Badge tone="neutral">{modeLabel(result.mode)}</Badge>}
                    {result.blockers.map((b) => (
                      <Badge key={b} tone="danger">
                        {blockerLabel(b)}
                      </Badge>
                    ))}
                    {result.blockers.length === 0 && !result.mode && (
                      <Text variant="ui" tone="secondary">
                        No blockers or mode detected. Looks clean.
                      </Text>
                    )}
                  </Stack>
                  {result.hits.length > 0 && (
                    <Box
                      as="ul"
                      sx={{
                        listStyle: 'none',
                        m: 0,
                        p: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'sm',
                      }}
                    >
                      {result.hits.map((h, i) => (
                        <li key={i}>
                          <Text variant="caption" as="span" tone="secondary">
                            {h.tag}: “{h.evidence}”
                          </Text>
                        </li>
                      ))}
                    </Box>
                  )}
                  <Text variant="caption" as="span" tone="secondary">
                    Applying merges these with any tags you’ve set; you can edit everything after.
                  </Text>
                </Stack>
              )}
              <Stack direction="row" gap="tight">
                {result ? (
                  <Button variant="primary" size="md" onClick={apply}>
                    Apply to this job
                  </Button>
                ) : (
                  <Button variant="secondary" size="md" onClick={run} disabled={!text.trim()}>
                    Screen
                  </Button>
                )}
                {(text || result) && (
                  <Button variant="tertiary" size="md" onClick={reset}>
                    Clear
                  </Button>
                )}
              </Stack>
            </Stack>
          </Box>
        </PanelBody>
      )}
    </Panel>
  );
}
