import { lazy, Suspense, useState } from 'react';
import { Button, Input as HdsInput, Tag, Text, Box, Switcher } from '@hirobius/design-system';
import { ScanText } from 'lucide-react';
import { updateJob } from './store';
import { DEFAULT_BLOCKERS, MODES, VERDICTS, blockerLabel } from './screening';
import type { Job } from './types';

const ScreenJdDialog = lazy(() => import('./ScreenJdDialog'));

// Detail-panel editor for a job's screening fields (issue #60): fit (verdict), work mode, and
// dealbreakers are toggle chips (all optional → chips, not a required SegmentedControl); travel /
// applicants are numbers; angle is a note. Every change writes straight through updateJob.

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Text variant="caption" style={{ color: 'var(--semantic-color-content-secondary)' }}>
        {children}
      </Text>
    </Box>
  );
}

function Chips({ children }: { children: React.ReactNode }) {
  return <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>{children}</Box>;
}

function NumField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value?: number;
  suffix?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, '& > *': { width: '100%' } }}>
      <HdsInput
        size="sm"
        label={suffix ? `${label} (${suffix})` : label}
        inputMode="numeric"
        value={value == null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    </Box>
  );
}

export function ScreeningEditor({ job }: { job: Job }) {
  const [custom, setCustom] = useState('');
  const [screenOpen, setScreenOpen] = useState(false);
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
  const setNum = (key: 'travelPct' | 'applicants', v: string) => {
    const n = v.trim() === '' ? undefined : Number(v);
    updateJob(job.url, { [key]: n != null && isFinite(n) && n >= 0 ? n : undefined });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Button
          variant="secondary"
          size="sm"
          iconLeft={<ScanText size={15} />}
          onClick={() => setScreenOpen(true)}
        >
          Screen a job description
        </Button>
        {job.screenedAt && (
          <Box sx={{ mt: 1 }}>
            <Text variant="caption" style={{ color: 'var(--semantic-color-content-secondary)' }}>
              Screened {new Date(job.screenedAt).toLocaleDateString()}
            </Text>
          </Box>
        )}
      </Box>
      {screenOpen && (
        <Suspense fallback={null}>
          <ScreenJdDialog job={job} open onClose={() => setScreenOpen(false)} />
        </Suspense>
      )}

      <Box>
        <FieldLabel>Fit</FieldLabel>
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
            <Tag key={b} active onClick={() => toggleBlocker(b)}>
              {blockerLabel(b)} ✕
            </Tag>
          ))}
        </Chips>
        <Box sx={{ mt: 'xs', maxWidth: 240, '& > *': { width: '100%' } }}>
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

      <Switcher gap="tight">
        <NumField
          label="Travel"
          suffix="%"
          value={job.travelPct}
          onChange={(v) => setNum('travelPct', v)}
        />
        <NumField
          label="Applicants"
          value={job.applicants}
          onChange={(v) => setNum('applicants', v)}
        />
      </Switcher>

      <Box sx={{ '& > *': { width: '100%' } }}>
        <HdsInput
          size="sm"
          label="Angle (positioning for this role)"
          value={job.angle ?? ''}
          onChange={(e) => updateJob(job.url, { angle: e.target.value })}
        />
      </Box>
    </Box>
  );
}
