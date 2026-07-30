import { useState } from 'react';
import { Box, Stack, Typography } from './ui/box';
import { Badge, Button } from '@hirobius/design-system';
import { ChevronDown } from 'lucide-react';
import { Reveal } from './ui/Reveal';
import { computeFunnel } from './funnel';
import { VERDICTS, MODES } from './screening';
import type { Job } from './types';

// A compact, collapsible read on pipeline shape (issue #60 §funnel): fit / mode counts + median
// applicant count, over whatever list the Queue is currently showing. Hidden when there's nothing
// to summarize. Reuses the AA-verified HDS feedback tones — no chart lib.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ minWidth: 44, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: 11 }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
}

export function FunnelSummary({ jobs }: { jobs: Job[] }) {
  const [open, setOpen] = useState(false);
  if (jobs.length === 0) return null;
  const f = computeFunnel(jobs);
  const noMode = MODES.every((m) => f.byMode[m.value] === 0);
  return (
    <Box sx={{ mb: 1.5 }}>
      <Button
        variant="tertiary"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        iconLeft={
          <ChevronDown
            size={15}
            style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }}
          />
        }
      >
        Funnel · {f.total}
      </Button>
      <Reveal open={open}>
        <Stack spacing={0.75} sx={{ pt: 1, pl: 0.5 }}>
          <Row label="Fit">
            {VERDICTS.map((v) => (
              <Badge key={v.value} tone={v.tone}>
                {v.label} {f.byVerdict[v.value]}
              </Badge>
            ))}
          </Row>
          <Row label="Mode">
            {noMode ? (
              <Typography variant="caption" color="text.secondary">
                none set
              </Typography>
            ) : (
              MODES.filter((m) => f.byMode[m.value] > 0).map((m) => (
                <Badge key={m.value} tone="neutral">
                  {m.label} {f.byMode[m.value]}
                </Badge>
              ))
            )}
          </Row>
          {f.medianApplicants != null && (
            <Typography variant="caption" color="text.secondary">
              Median applicants: <strong>{f.medianApplicants}</strong> (where you logged a count)
            </Typography>
          )}
        </Stack>
      </Reveal>
    </Box>
  );
}
