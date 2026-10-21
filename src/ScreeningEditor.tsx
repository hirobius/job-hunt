import { useState } from 'react';
import { X } from 'lucide-react';
import { Icon, Input as HdsInput, Tag, Text, Box } from '@hirobius/design-system';
import { updateJob } from './store';
import { DEFAULT_BLOCKERS, MODES, VERDICTS, blockerLabel } from './screening';
import type { Job } from './types';

// Detail-panel editor for a job's screening fields (issue #60): fit (verdict), work mode, and
// dealbreakers are toggle chips (all optional → chips, not a required SegmentedControl); angle is a note.
// Every change writes straight through updateJob.

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Text variant="caption" as="div" tone="secondary">
        {children}
      </Text>
    </Box>
  );
}

function Chips({ children }: { children: React.ReactNode }) {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>{children}</Box>;
}

export function ScreeningEditor({ job, fitLabel = true }: { job: Job; fitLabel?: boolean }) {
  const [custom, setCustom] = useState('');
  const blockers = job.blockers ?? [];
  const defaultIds = new Set(DEFAULT_BLOCKERS.map((b) => b.id));
  const customTags = blockers.filter((b) => !defaultIds.has(b));

  const toggleBlocker = (id: string) =>
    updateJob(job.url, {
      blockers: blockers.includes(id) ? blockers.filter((b) => b !== id) : [...blockers, id],
    });
  const addCustom = () => {
    const t = custom.trim().toLowerCase().replace(/\s+/g, '_');
    if (t && !blockers.includes(t)) updateJob(job.url, { blockers: [...blockers, t] });
    setCustom('');
  };

  return (
    <Box className="rjb-form-full" sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Under a panel already headed "Fit", the row needs no second label (rev-3 review). */}
      <Box role="group" aria-label="Fit">
        {fitLabel && <FieldLabel>Fit</FieldLabel>}
        <Chips>
          {VERDICTS.map((v) => (
            <Tag
              key={v.value}
              active={job.verdict === v.value}
              onClick={() =>
                updateJob(job.url, { verdict: job.verdict === v.value ? undefined : v.value })
              }
            >
              {v.label}
            </Tag>
          ))}
        </Chips>
      </Box>

      <Box>
        <FieldLabel>Work mode</FieldLabel>
        <Chips>
          {MODES.map((m) => (
            <Tag
              key={m.value}
              active={job.mode === m.value}
              onClick={() =>
                updateJob(job.url, { mode: job.mode === m.value ? undefined : m.value })
              }
            >
              {m.label}
            </Tag>
          ))}
        </Chips>
      </Box>

      <Box>
        <FieldLabel>Dealbreakers</FieldLabel>
        <Chips>
          {DEFAULT_BLOCKERS.map((b) => (
            <Tag key={b.id} active={blockers.includes(b.id)} onClick={() => toggleBlocker(b.id)}>
              {b.label}
            </Tag>
          ))}
          {customTags.map((b) => (
            <Tag
              key={b}
              active
              aria-label={`Remove ${blockerLabel(b)}`}
              onClick={() => toggleBlocker(b)}
            >
              {blockerLabel(b)}
              <Icon icon={X} size="small" />
            </Tag>
          ))}
        </Chips>
        <Box sx={{ display: 'contents', '& input': { mt: 2, maxWidth: 240 } }}>
          <HdsInput
            size="sm"
            aria-label="Add a custom dealbreaker"
            placeholder="Add a dealbreaker…"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
          />
        </Box>
      </Box>

      <Box sx={{ '& > *': { width: '100%' } }}>
        <FieldLabel>Angle for this role</FieldLabel>
        <HdsInput
          size="sm"
          aria-label="Angle for this role"
          placeholder="What you lead with for this job"
          value={job.angle ?? ''}
          onChange={(e) => updateJob(job.url, { angle: e.target.value })}
        />
      </Box>
    </Box>
  );
}
