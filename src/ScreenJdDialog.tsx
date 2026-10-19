import { useState } from 'react';
import { Badge, Button, Dialog, Textarea, Box, Text } from '@hirobius/design-system';
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
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Text variant="ui" style={{ color: 'var(--semantic-color-content-secondary)' }}>
                Paste the posting. This runs local keyword rules — nothing leaves your browser, no
                AI.
              </Text>
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
                    borderTop: 'thin solid',
                    borderColor: 'border.default',
                    pt: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'xs',
                  }}
                >
                  <Text
                    variant="caption"
                    as="span"
                    style={{ color: 'var(--semantic-color-content-secondary)' }}
                  >
                    Suggested
                  </Text>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
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
                      <Text
                        variant="ui"
                        style={{ color: 'var(--semantic-color-content-secondary)' }}
                      >
                        No blockers or mode detected — looks clean.
                      </Text>
                    )}
                  </Box>
                  {result.hits.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Text
                        variant="caption"
                        as="span"
                        style={{
                          color: 'var(--semantic-color-content-secondary)',
                          display: 'block',
                          marginBottom: 'calc(var(--primitive-space-1) * 0.5)',
                        }}
                      >
                        Why:
                      </Text>
                      {result.hits.map((h, i) => (
                        <Text
                          variant="caption"
                          as="span"
                          style={{
                            color: 'var(--semantic-color-content-secondary)',
                            display: 'block',
                          }}
                          key={i}
                        >
                          · {h.tag} — “{h.evidence}”
                        </Text>
                      ))}
                    </Box>
                  )}
                  <Text
                    variant="caption"
                    as="span"
                    style={{ color: 'var(--semantic-color-content-secondary)' }}
                  >
                    Applying merges these with any tags you’ve set; you can edit everything after.
                  </Text>
                </Box>
              )}
            </Box>
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
