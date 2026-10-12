import { Stack, Stat, Text, VisuallyHidden } from '@hirobius/design-system';
import { pipelineMetrics, weeklyApplied } from './metrics';
import type { Job } from './types';

// Pipeline stat band + 8-week "applied per week" bars (spec #98). Pure HDS + token CSS vars; the
// numbers come from metrics.ts. Hidden until at least one job has ever been applied to.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CHART_H = 56;

const weekLabel = (ymd: string) => `${MONTHS[+ymd.slice(5, 7) - 1]} ${+ymd.slice(8, 10)}`;
// Axis label: month only where it changes ("Aug 24, 31, Sep 7 …") so 8 weeks fit at 390px.
const axisLabel = (ymd: string, prev?: string) =>
  prev && prev.slice(5, 7) === ymd.slice(5, 7) ? String(+ymd.slice(8, 10)) : weekLabel(ymd);
const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`);

export function PipelineStats({ jobs }: { jobs: Job[] }) {
  const now = new Date();
  const m = pipelineMetrics(jobs, now);
  if (m.appliedTotal === 0) return null;
  const weeks = weeklyApplied(jobs, now);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const summary = `Applications per week, last ${weeks.length} weeks: ${weeks
    .map((w) => `week of ${weekLabel(w.weekStart)}, ${w.count}`)
    .join('; ')}.`;
  const tile = { minWidth: 0 } as const;
  const median =
    m.medianDaysToResponse == null ? '—' : Math.round(m.medianDaysToResponse * 10) / 10;

  return (
    <Stack gap="normal" style={{ marginBottom: 'var(--primitive-space-4)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 'var(--primitive-space-3)',
        }}
      >
        <Stat style={tile} label="Applied 7d" value={m.appliedLast7} />
        <Stat style={tile} label="Applied 30d" value={m.appliedLast30} />
        <Stat style={tile} label="Response rate" value={pct(m.responseRate)} />
        <Stat style={tile} label="Interview rate" value={pct(m.interviewRate)} />
        <Stat
          style={tile}
          label="Median reply"
          value={median}
          sub={m.medianDaysToResponse == null ? undefined : 'days'}
        />
        <Stat
          style={tile}
          label="Follow-ups due"
          value={m.followUpsDue}
          tone={m.followUpsDue > 0 ? 'warning' : 'neutral'}
        />
      </div>
      <Stack gap="tight">
        <Text
          variant="caption"
          as="h3"
          style={{ color: 'var(--semantic-color-content-secondary)' }}
        >
          Applied per week
        </Text>
        <div
          role="img"
          aria-label={summary}
          style={{ display: 'flex', gap: 'var(--primitive-space-2)' }}
        >
          {weeks.map((w, i) => (
            <div
              key={w.weekStart}
              title={`Week of ${weekLabel(w.weekStart)}: ${w.count}`}
              style={{
                flex: '1 1 0%',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <Text variant="caption" style={{ color: 'var(--semantic-color-content-primary)' }}>
                {w.count}
              </Text>
              <div
                style={{
                  height: CHART_H,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'flex-end',
                  borderBottom: '1px solid var(--semantic-color-border-subtle)',
                }}
              >
                <div
                  data-testid="week-bar"
                  style={{
                    width: '100%',
                    height: w.count ? Math.max(3, Math.round((w.count / max) * CHART_H)) : 0,
                    background: 'var(--semantic-accent-rest)',
                    borderRadius: '4px 4px 0 0',
                    opacity: i === weeks.length - 1 ? 1 : 0.8,
                  }}
                />
              </div>
              <Text
                variant="caption"
                style={{ color: 'var(--semantic-color-content-secondary)', whiteSpace: 'nowrap' }}
              >
                {axisLabel(w.weekStart, weeks[i - 1]?.weekStart)}
              </Text>
            </div>
          ))}
        </div>
        <VisuallyHidden as="ul">
          {weeks.map((w) => (
            <li key={w.weekStart}>
              Week of {weekLabel(w.weekStart)}: {w.count} applied
            </li>
          ))}
        </VisuallyHidden>
      </Stack>
    </Stack>
  );
}
