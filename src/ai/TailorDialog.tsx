import { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { tailorResume } from './tailorResume';
import { renderResumeMarkdown, type TailoredResume } from './tailor-core';
import { loadResume, saveResume } from './profile';
import type { Job } from '../types';

type Phase = 'input' | 'loading' | 'result';
type Msg = { severity: 'error' | 'info' | 'warning'; text: string };

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
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const run = async () => {
    setMsg(null);
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
      setMsg({
        severity: 'info',
        text: res.message ?? 'AI isn’t configured yet — set ANTHROPIC_API_KEY in Vercel.',
      });
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
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Tailor résumé</DialogTitle>
      <DialogContent dividers>
        {msg && (
          <Alert severity={msg.severity} sx={{ mb: 1.5 }} onClose={() => setMsg(null)}>
            {msg.text}
          </Alert>
        )}

        {phase === 'loading' ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 5 }}>
            <CircularProgress size={28} />
            <Typography color="text.secondary">Tailoring your résumé… (~20–40s)</Typography>
          </Stack>
        ) : phase === 'result' && result ? (
          <Stack spacing={1.25}>
            <Typography variant="caption" color="text.secondary">
              Drawn only from your résumé — reordered and rephrased for this role. Review, then copy
              or download.
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
                    <Chip key={i} label={s} size="small" variant="outlined" />
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
                    <Chip key={i} label={u} size="small" color="warning" variant="outlined" />
                  ))}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  The role asks for these but your résumé doesn’t evidence them — they were left out
                  rather than invented.
                </Typography>
              </Box>
            )}
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <TextField
              label="Your résumé"
              placeholder="Paste your full résumé text…"
              fullWidth
              multiline
              minRows={8}
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              helperText="Saved on your device only. The tailorer uses only what's here — it never invents experience."
            />
            <TextField
              label="Target role"
              fullWidth
              multiline
              minRows={3}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              helperText="Prefilled from this job. Paste the full description for a sharper tailor."
            />
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        {phase === 'result' && result ? (
          <>
            <Button onClick={() => setPhase('input')}>Back</Button>
            <Button onClick={() => download('resume-tailored.md', renderResumeMarkdown(result))}>
              Download .md
            </Button>
            <Button variant="contained" onClick={copyMarkdown}>
              {copied ? 'Copied ✓' : 'Copy Markdown'}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="contained" onClick={run} disabled={!canRun}>
              {phase === 'loading' ? 'Working…' : 'Tailor'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
