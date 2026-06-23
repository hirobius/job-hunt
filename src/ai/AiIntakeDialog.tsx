import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { extractJob } from './extractJob';
import AiNotConfigured from './AiNotConfigured';
import type { ExtractedJob } from './extract-core';
import { jobTitle, composeNote } from './intake';
import { loadSkills, saveSkills } from './profile';
import { addJobDetailed } from '../store';

type Phase = 'input' | 'loading' | 'review';
type Mode = 'link' | 'text';
type Msg = { severity: 'error' | 'info' | 'warning'; text: string };

const MIN_PASTE = 80; // server rejects job text shorter than this
const looksLikeUrl = (s: string) => {
  const t = s.trim();
  return t.length > 3 && /\./.test(t) && !/\s/.test(t);
};

export default function AiIntakeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('input');
  const [mode, setMode] = useState<Mode>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [skills, setSkills] = useState(loadSkills); // lazy: read the saved profile once
  const [showSkills, setShowSkills] = useState(false);
  const [job, setJob] = useState<ExtractedJob | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight request if the dialog unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const reset = () => {
    abortRef.current?.abort();
    setPhase('input');
    setMode('link');
    setUrl('');
    setText('');
    setJob(null);
    setMsg(null);
    setNotConfigured(false);
    setShowSkills(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  const canRun =
    mode === 'link' ? looksLikeUrl(url) : looksLikeUrl(url) && text.trim().length >= MIN_PASTE;

  const run = async () => {
    setMsg(null);
    setPhase('loading');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const res = await extractJob(mode === 'link' ? { url, skills } : { url, text, skills }, {
      signal: ctrl.signal,
    });
    if (ctrl.signal.aborted) return;

    if (res.ok) {
      setJob(res.job);
      setPhase('review');
      return;
    }
    setPhase('input');
    if (res.error === 'not_configured') {
      setNotConfigured(true);
    } else if (res.fallback === 'paste') {
      setMode('text');
      setMsg({
        severity: 'warning',
        text: res.message ?? 'Couldn’t read that link — paste the description below and retry.',
      });
    } else {
      setMsg({ severity: 'error', text: res.message ?? 'Something went wrong — try again.' });
    }
  };

  const edit = (patch: Partial<ExtractedJob>) => setJob((j) => (j ? { ...j, ...patch } : j));

  const save = () => {
    if (!job) return;
    saveSkills(skills);
    const stored = addJobDetailed(url, {
      label: jobTitle(job),
      salary: job.salary,
      note: composeNote(job),
    });
    if (stored) {
      close();
    } else {
      setMsg({ severity: 'info', text: 'That job is already in your queue.' });
    }
  };

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <DialogTitle>Add with AI</DialogTitle>
      <DialogContent dividers>
        {msg && (
          <Alert severity={msg.severity} sx={{ mb: 1.5 }} onClose={() => setMsg(null)}>
            {msg.text}
          </Alert>
        )}

        {notConfigured ? (
          <AiNotConfigured feature="“Add with AI”" />
        ) : phase === 'loading' ? (
          <Stack alignItems="center" spacing={1.5} sx={{ py: 5 }}>
            <CircularProgress size={28} />
            <Typography color="text.secondary">
              {mode === 'link' ? 'Reading the posting…' : 'Extracting details…'}
            </Typography>
          </Stack>
        ) : phase === 'review' && job ? (
          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Title"
                size="small"
                fullWidth
                value={job.title}
                onChange={(e) => edit({ title: e.target.value })}
              />
              <TextField
                label="Company"
                size="small"
                fullWidth
                value={job.company}
                onChange={(e) => edit({ company: e.target.value })}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Location"
                size="small"
                fullWidth
                value={job.location}
                onChange={(e) => edit({ location: e.target.value })}
              />
              <TextField
                label="Seniority"
                size="small"
                fullWidth
                value={job.seniority}
                onChange={(e) => edit({ seniority: e.target.value })}
              />
            </Stack>
            <TextField
              label="Salary"
              size="small"
              fullWidth
              value={job.salary}
              onChange={(e) => edit({ salary: e.target.value })}
            />

            {job.requirements.length > 0 && (
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Key requirements
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {job.requirements.map((r, i) => (
                    <Chip key={i} label={r} size="small" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}

            {(job.matched.length > 0 || job.gaps.length > 0) && (
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Fit vs your skills
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {job.matched.map((m, i) => (
                    <Chip key={`m${i}`} label={m} size="small" color="success" variant="outlined" />
                  ))}
                  {job.gaps.map((g, i) => (
                    <Chip
                      key={`g${i}`}
                      label={`Gap: ${g}`}
                      size="small"
                      color="warning"
                      variant="outlined"
                    />
                  ))}
                </Box>
              </Box>
            )}

            {skills.trim() === '' && (
              <Typography variant="caption" color="text.secondary">
                Tip: add your skills (Back → “Add your skills”) to get match/gap analysis.
              </Typography>
            )}
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <ToggleButtonGroup
              value={mode}
              exclusive
              size="small"
              onChange={(_, v) => v && setMode(v)}
              sx={{
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  px: 1.5,
                  py: 0.5,
                },
              }}
            >
              <ToggleButton value="link">From a link</ToggleButton>
              <ToggleButton value="text">Paste description</ToggleButton>
            </ToggleButtonGroup>

            <TextField
              label="Job link"
              placeholder="https://…"
              size="small"
              fullWidth
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              helperText={
                mode === 'text'
                  ? 'Saved as the job’s link so you can reopen it.'
                  : 'We’ll fetch the posting and structure it.'
              }
            />

            {mode === 'text' && (
              <TextField
                label="Job description"
                placeholder="Paste the full job description…"
                fullWidth
                multiline
                minRows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            )}

            <Box>
              <Button size="small" variant="text" onClick={() => setShowSkills((s) => !s)}>
                {showSkills ? 'Hide your skills' : 'Add your skills (improves match/gap)'}
              </Button>
              <Collapse in={showSkills}>
                <TextField
                  label="Your skills / profile"
                  placeholder="e.g. React, TypeScript, design systems, accessibility, Figma…"
                  fullWidth
                  multiline
                  minRows={3}
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  sx={{ mt: 1 }}
                />
              </Collapse>
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        {notConfigured ? (
          <Button variant="contained" onClick={close}>
            Close
          </Button>
        ) : phase === 'review' ? (
          <>
            <Button
              onClick={() => {
                setPhase('input');
                setJob(null);
              }}
            >
              Back
            </Button>
            <Button variant="contained" onClick={save}>
              Save to queue
            </Button>
          </>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="contained" onClick={run} disabled={!canRun || phase === 'loading'}>
              {phase === 'loading' ? 'Working…' : 'Extract'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
