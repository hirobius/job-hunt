import { useEffect, useRef, useState } from 'react';
import { Box, Stack, Typography } from '../ui/box';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  IconButton,
  Input,
  SegmentedControl,
  Spinner,
  Textarea,
} from '@hirobius/design-system';
import { X } from 'lucide-react';
import { Reveal } from '../ui/Reveal';
import { extractJob } from './extractJob';
import AiNotConfigured from './AiNotConfigured';
import type { ExtractedJob } from './extract-core';
import { jobTitle, composeNote } from './intake';
import { loadSkills, saveSkills } from './profile';
import { addJobDetailed } from '../store';

type Phase = 'input' | 'loading' | 'review';
type Mode = 'link' | 'text';
type Msg = { severity: 'error' | 'info' | 'warning'; text: string };

// MUI severity → HDS Alert tone (inlined from the retired ui/Alert seam).
const ALERT_TONE = { error: 'danger', warning: 'warning', info: 'info' } as const;

// Full-width field wrapper (inlined from the retired ui/TextField seam) — HDS
// Input/Textarea need an outer box to stretch, matching TrackerView's fields.
const fieldSx = { minWidth: 0, width: '100%', '& > *': { width: '100%' } } as const;

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
      company: job.company,
      location: job.location,
      seniority: job.seniority,
    });
    if (stored) {
      close();
    } else {
      setMsg({ severity: 'info', text: 'That job is already in your queue.' });
    }
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
            <Dialog.Title>Add with AI</Dialog.Title>
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
              <AiNotConfigured feature="“Add with AI”" />
            ) : phase === 'loading' ? (
              <Stack alignItems="center" spacing={1.5} sx={{ py: 5 }}>
                <Spinner size="lg" />
                <Typography color="text.secondary">
                  {mode === 'link' ? 'Reading the posting…' : 'Extracting details…'}
                </Typography>
              </Stack>
            ) : phase === 'review' && job ? (
              <Stack spacing={1.5}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Box sx={fieldSx}>
                    <Input
                      size="sm"
                      label="Title"
                      value={job.title}
                      onChange={(e) => edit({ title: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </Box>
                  <Box sx={fieldSx}>
                    <Input
                      size="sm"
                      label="Company"
                      value={job.company}
                      onChange={(e) => edit({ company: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </Box>
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                  <Box sx={fieldSx}>
                    <Input
                      size="sm"
                      label="Location"
                      value={job.location}
                      onChange={(e) => edit({ location: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </Box>
                  <Box sx={fieldSx}>
                    <Input
                      size="sm"
                      label="Seniority"
                      value={job.seniority}
                      onChange={(e) => edit({ seniority: e.target.value })}
                      style={{ width: '100%' }}
                    />
                  </Box>
                </Stack>
                <Box sx={fieldSx}>
                  <Input
                    size="sm"
                    label="Salary"
                    value={job.salary}
                    onChange={(e) => edit({ salary: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </Box>

                {job.requirements.length > 0 && (
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Key requirements
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                      {job.requirements.map((r, i) => (
                        <Badge key={i} tone="neutral">
                          {r}
                        </Badge>
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
                        <Badge key={`m${i}`} tone="success">
                          {m}
                        </Badge>
                      ))}
                      {job.gaps.map((g, i) => (
                        <Badge key={`g${i}`} tone="warning">
                          Gap: {g}
                        </Badge>
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
                <Box sx={{ alignSelf: 'flex-start' }}>
                  <SegmentedControl
                    aria-label="Intake mode"
                    size="sm"
                    value={mode}
                    onChange={(v) => setMode(v as typeof mode)}
                    options={[
                      { value: 'link', label: 'From a link' },
                      { value: 'text', label: 'Paste description' },
                    ]}
                  />
                </Box>

                <Box sx={fieldSx}>
                  <Input
                    size="sm"
                    label="Job link"
                    placeholder="https://…"
                    autoFocus
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    helperText={
                      mode === 'text'
                        ? 'Saved as the job’s link so you can reopen it.'
                        : 'We’ll fetch the posting and structure it.'
                    }
                    style={{ width: '100%' }}
                  />
                </Box>

                {mode === 'text' && (
                  <Box sx={fieldSx}>
                    <Textarea
                      label="Job description"
                      placeholder="Paste the full job description…"
                      rows={6}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </Box>
                )}

                <Box>
                  <Button size="sm" variant="tertiary" onClick={() => setShowSkills((s) => !s)}>
                    {showSkills ? 'Hide your skills' : 'Add your skills (improves match/gap)'}
                  </Button>
                  <Reveal open={showSkills}>
                    <Box sx={{ ...fieldSx, mt: 1 }}>
                      <Textarea
                        label="Your skills / profile"
                        placeholder="e.g. React, TypeScript, design systems, accessibility, Figma…"
                        rows={3}
                        value={skills}
                        onChange={(e) => setSkills(e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </Box>
                  </Reveal>
                </Box>
              </Stack>
            )}
          </div>

          <Dialog.Footer>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {notConfigured ? (
                <Button variant="primary" onClick={close}>
                  Close
                </Button>
              ) : phase === 'review' ? (
                <>
                  <Button
                    variant="tertiary"
                    onClick={() => {
                      setPhase('input');
                      setJob(null);
                    }}
                  >
                    Back
                  </Button>
                  <Button variant="primary" onClick={save}>
                    Save to queue
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="tertiary" onClick={close}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={run} disabled={!canRun || phase === 'loading'}>
                    {phase === 'loading' ? 'Working…' : 'Extract'}
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
