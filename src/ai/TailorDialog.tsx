import { useRef, useState } from 'react';
import { Box, Divider, Stack, Typography } from '../ui/box';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  IconButton,
  Spinner,
  Tag,
  Textarea,
} from '@hirobius/design-system';
import { X } from 'lucide-react';
import { tailorResume } from './tailorResume';
import AiNotConfigured from './AiNotConfigured';
import { renderResumeMarkdown, type TailoredResume } from './tailor-core';
import { loadResume, saveResume } from './profile';
import { useActivePillar } from '../pillarStore';
import type { Job } from '../types';

type Phase = 'input' | 'loading' | 'result';
type Msg = { severity: 'error' | 'info' | 'warning'; text: string };

// MUI severity → HDS Alert tone (inlined from the retired ui/Alert seam).
const ALERT_TONE = { error: 'danger', warning: 'warning', info: 'info' } as const;

// Full-width field wrapper (inlined from the retired ui/TextField seam).
const fieldSx = { minWidth: 0, width: '100%', '& > *': { width: '100%' } } as const;

const MIN_RESUME = 120;

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function TailorDialog({
  open,
  onClose,
  job,
}: {
  open: boolean;
  onClose: () => void;
  job: Job;
}) {
  const initialRole = [job.label, job.note, job.salary && `Salary: ${job.salary}`]
    .filter(Boolean)
    .join('\n\n');

  const [phase, setPhase] = useState<Phase>('input');
  const [resume, setResume] = useState(loadResume);
  const [role, setRole] = useState(initialRole);
  const [result, setResult] = useState<TailoredResume | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pillar = useActivePillar();

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const run = async () => {
    setMsg(null);
    setNotConfigured(false);
    saveResume(resume);
    setPhase('loading');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const res = await tailorResume({ resume, job: role }, { signal: ctrl.signal });
    if (ctrl.signal.aborted) return;
    if (res.ok) {
      setResult(res.tailored);
      setPhase('result');
      return;
    }
    setPhase('input');
    if (res.error === 'not_configured') {
      setNotConfigured(true);
    } else {
      setMsg({ severity: 'error', text: res.message ?? 'Something went wrong — try again.' });
    }
  };

  const copyMarkdown = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(renderResumeMarkdown(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setMsg({ severity: 'warning', text: 'Clipboard blocked — use Download instead.' });
    }
  };

  const canRun = resume.trim().length >= MIN_RESUME && phase !== 'loading';

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
            <Dialog.Title>Tailor résumé</Dialog.Title>
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
            {msg && (
              <Box sx={{ position: 'relative', mb: 1.5 }}>
                <Alert tone={ALERT_TONE[msg.severity]}>{msg.text}</Alert>
                <Box sx={{ position: 'absolute', top: 4, right: 4 }}>
                  <IconButton
                    size="sm"
                    variant="tertiary"
                    icon={X}
                    label="Dismiss"
                    onClick={() => setMsg(null)}
                  />
                </Box>
              </Box>
            )}

            {notConfigured ? (
              <AiNotConfigured feature="Résumé tailoring" />
            ) : phase === 'loading' ? (
              <Stack alignItems="center" spacing={1.5} sx={{ py: 5 }}>
                <Spinner size="lg" />
                <Typography color="text.secondary">Tailoring your résumé… (~20–40s)</Typography>
              </Stack>
            ) : phase === 'result' && result ? (
              <Stack spacing={1.25}>
                <Typography variant="caption" color="text.secondary">
                  Drawn only from your résumé — reordered and rephrased for this role. Review, then
                  copy or download.
                </Typography>

                {result.name && <Typography variant="h6">{result.name}</Typography>}
                {result.contact && (
                  <Typography variant="body2" color="text.secondary">
                    {result.contact}
                  </Typography>
                )}

                {result.summary && (
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Summary
                    </Typography>
                    <Typography variant="body2">{result.summary}</Typography>
                  </Box>
                )}

                {result.skills.length > 0 && (
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Skills
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {result.skills.map((s, i) => (
                        <Badge key={i} tone="neutral">
                          {s}
                        </Badge>
                      ))}
                    </Box>
                  </Box>
                )}

                {result.experience.length > 0 && (
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Experience
                    </Typography>
                    <Stack spacing={1} sx={{ mt: 0.5 }}>
                      {result.experience.map((e, i) => (
                        <Box key={i}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {[e.title, e.company].filter(Boolean).join(' — ')}
                          </Typography>
                          {[e.location, e.dates].filter(Boolean).length > 0 && (
                            <Typography variant="caption" color="text.secondary">
                              {[e.location, e.dates].filter(Boolean).join(' · ')}
                            </Typography>
                          )}
                          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
                            {e.bullets.map((b, j) => (
                              <li key={j}>
                                <Typography variant="body2">{b}</Typography>
                              </li>
                            ))}
                          </Box>
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                )}

                {result.education.length > 0 && (
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Education
                    </Typography>
                    {result.education.map((e, i) => (
                      <Typography key={i} variant="body2">
                        {[e.credential, e.school].filter(Boolean).join(', ')}
                        {e.dates ? ` (${e.dates})` : ''}
                      </Typography>
                    ))}
                  </Box>
                )}

                {(result.unsupported.length > 0 || result.emphasis) && <Divider />}

                {result.emphasis && (
                  <Typography variant="caption" color="text.secondary">
                    <strong>What changed:</strong> {result.emphasis}
                  </Typography>
                )}

                {result.unsupported.length > 0 && (
                  <Box>
                    <Typography variant="overline" color="warning.main">
                      Not claimed — no résumé evidence
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {result.unsupported.map((u, i) => (
                        <Badge key={i} tone="warning">
                          {u}
                        </Badge>
                      ))}
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      The role asks for these but your résumé doesn’t evidence them — they were left
                      out rather than invented.
                    </Typography>
                  </Box>
                )}
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                <Box sx={fieldSx}>
                  <Textarea
                    label="Your résumé"
                    placeholder="Paste your full résumé text…"
                    rows={8}
                    value={resume}
                    onChange={(e) => setResume(e.target.value)}
                    helperText="Saved on your device only. The tailorer uses only what's here — it never invents experience."
                    style={{ width: '100%' }}
                  />
                </Box>
                <Box sx={fieldSx}>
                  <Textarea
                    label="Target role"
                    rows={3}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    helperText="Prefilled from this job. Paste the full description for a sharper tailor."
                    style={{ width: '100%' }}
                  />
                </Box>
                {pillar.tailorRole && (
                  <Box>
                    <Tag
                      onClick={() =>
                        setRole((r) =>
                          r.startsWith('Target role:')
                            ? r
                            : `Target role: ${pillar.tailorRole}\n\n${r}`,
                        )
                      }
                    >
                      + {pillar.label} target: {pillar.tailorRole}
                    </Tag>
                  </Box>
                )}
              </Stack>
            )}
          </div>

          <Dialog.Footer>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {notConfigured ? (
                <Button variant="primary" onClick={close}>
                  Close
                </Button>
              ) : phase === 'result' && result ? (
                <>
                  <Button variant="tertiary" onClick={() => setPhase('input')}>
                    Back
                  </Button>
                  <Button
                    variant="tertiary"
                    onClick={() => download('resume-tailored.md', renderResumeMarkdown(result))}
                  >
                    Download .md
                  </Button>
                  <Button variant="primary" onClick={copyMarkdown}>
                    {copied ? 'Copied ✓' : 'Copy Markdown'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="tertiary" onClick={close}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={run} disabled={!canRun}>
                    {phase === 'loading' ? 'Working…' : 'Tailor'}
                  </Button>
                </>
              )}
            </div>
          </Dialog.Footer>
        </div>
      </Dialog.Content>
    </Dialog>
  );
}
