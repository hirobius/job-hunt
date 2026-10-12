import { Badge, Box, Text, Disclosure } from '@hirobius/design-system';
import { computeFunnel } from './funnel';
import { VERDICTS, MODES } from './screening';
import type { Job } from './types';

// A compact, collapsible read on pipeline shape (issue #60 §funnel): fit / mode counts + median
// applicant count, over whatever list the Queue is currently showing. Hidden when there's nothing
// to summarize. Reuses the AA-verified HDS feedback tones — no chart lib.
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <Text
        variant="caption"
        as="span"
        style={{ color: 'var(--semantic-color-content-secondary)', minWidth: 44 }}
      >
        {label}
      </Text>
      {children}
    </Box>
  );
}

export function FunnelSummary({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) return null;
  const f = computeFunnel(jobs);
  const noMode = MODES.every((m) => f.byMode[m.value] === 0);
  return (
    <Box sx={{ mb: 3 }}>
      <Disclosure label={`Funnel · ${f.total}`}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 'xs', pl: 1 }}>
          <Row label="Fit">
            {VERDICTS.map((v) => (
              <Badge key={v.value} tone={v.tone}>
                {v.label} {f.byVerdict[v.value]}
              </Badge>
            ))}
          </Row>
          <Row label="Mode">
            {noMode ? (
              <Text
                variant="caption"
                as="span"
                style={{ color: 'var(--semantic-color-content-secondary)' }}
              >
                none set
              </Text>
            ) : (
              MODES.filter((m) => f.byMode[m.value] > 0).map((m) => (
                <Badge key={m.value} tone="neutral">
                  {m.label} {f.byMode[m.value]}
                </Badge>
              ))
            )}
          </Row>
          {f.medianApplicants != null && (
            <Text
              variant="caption"
              as="span"
              style={{ color: 'var(--semantic-color-content-secondary)' }}
            >
              Median applicants: <strong>{f.medianApplicants}</strong> (where you logged a count)
            </Text>
          )}
        </Box>
      </Disclosure>
    </Box>
  );
}
