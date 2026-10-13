import { useState } from 'react';
import { Badge, Button, Dialog, Textarea } from '@hirobius/design-system';
import { Box, Stack, Typography } from './ui/box';
import { screenJd, MAX_JD, type JdScreen } from './jdScreener';
import { suggestVerdict, verdictTone, modeLabel, blockerLabel } from './screening';
import { updateJob } from './store';
import type { Job } from './types';

// Paste a job description → deterministic rules screen → one-click apply onto the job (issue #61).
// No AI. The screen SUGGESTS; applying merges blockers with any the user already set, and the user
// can still edit every field in the panel afterward.
export default function ScreenJdDialog({
  job,
  open,
  onClose,
}: {
  job: Job;
  open: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<JdScreen | null>(null);

  const run = () => setResult(screenJd(text));
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
    close();
  };
  const close = () => {
    setText('');
    setResult(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <Dialog.Content
        style={{ width: '100%', maxWidth: 600, maxHeight: '85vh', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
          <Dialog.Header>
            <Dialog.Title>Screen a job description</Dialog.Title>
          </Dialog.Header>
          <div
            style={{
              overflowY: 'auto',
              padding: '16px 4px',
              borderTop: '1px solid var(--semantic-color-border-default)',
              borderBottom: '1px solid var(--semantic-color-border-default)',
              margin: '8px 0',
            }}
          >
            <Stack spacing={1.5}>
              <Typography variant="body2" color="text.secondary">
                Paste the posting. This runs local keyword rules — nothing leaves your browser, no
                AI.
              </Typography>
              <Textarea
                rows={8}
                value={text}
                placeholder="Paste the full job description…"
                onChange={(e) => setText(e.target.value.slice(0, MAX_JD))}
                style={{ width: '100%' }}
              />

              {result && (
                <Box
                  sx={{
                    borderTop: 1,
                    borderColor: 'divider',
                    pt: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                  >
                    Suggested
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                    <Badge tone={verdictTone(result.verdict)}>
                      {result.verdict.charAt(0).toUpperCase() + result.verdict.slice(1)}
                    </Badge>
                    {result.mode && <Badge tone="neutral">{modeLabel(result.mode)}</Badge>}
                    {result.travelPct != null && (
                      <Badge tone="neutral">{result.travelPct}% travel</Badge>
                    )}
                    {result.blockers.map((b) => (
                      <Badge key={b} tone="danger">
                        {blockerLabel(b)}
                      </Badge>
                    ))}
                    {result.blockers.length === 0 && !result.mode && result.travelPct == null && (
                      <Typography variant="body2" color="text.secondary">
                        No blockers or mode detected — looks clean.
                      </Typography>
                    )}
                  </Box>
                  {result.hits.length > 0 && (
                    <Box sx={{ mt: 0.5 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block', mb: 0.25 }}
                      >
                        Why:
                      </Typography>
                      {result.hits.map((h, i) => (
                        <Typography
                          key={i}
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block' }}
                        >
                          · {h.tag} — “{h.evidence}”
                        </Typography>
                      ))}
                    </Box>
                  )}
                  <Typography variant="caption" color="text.secondary">
                    Applying merges these with any tags you’ve set; you can edit everything after.
                  </Typography>
                </Box>
              )}
            </Stack>
          </div>
          <Dialog.Footer>
            <Button variant="tertiary" onClick={close}>
              Cancel
            </Button>
            {result ? (
              <Button variant="primary" onClick={apply}>
                Apply to this job
              </Button>
            ) : (
              <Button variant="primary" onClick={run} disabled={!text.trim()}>
                Screen
              </Button>
            )}
          </Dialog.Footer>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
