// Today's Insights band (#128): the pipeline's headline numbers as MetricTiles (with a trend line)
// and a stage funnel as Progress rows, in one Disclosure whose open state is kept per device.
// Composes the existing pure read models (metrics.ts, funnel.ts); weekly bars wait for an HDS chart
// primitive (#133).
import { useState } from 'react';
import { Disclosure, Grid, Progress, Stack, Text } from '@hirobius/design-system';
import { MetricTile } from '@hirobius/design-system/patterns';
import { pipelineMetrics, vsWeekBefore } from './metrics';
import { computeFunnel } from './funnel';
import { VERDICTS } from './screening';
import type { Job } from './types';

const OPEN_KEY = 'rjb_ui_insights_open';
const SECONDARY = { color: 'var(--semantic-color-content-secondary)' } as const;
const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`);

// Open unless this device closed it.
function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

export default function Insights({ jobs }: { jobs: Job[] }) {
  const [open, setOpen] = useState(readOpen);
  const m = pipelineMetrics(jobs, new Date());
  const f = computeFunnel(jobs);
  const total = jobs.length;
  const stages = [
    { label: 'Saved', count: total },
    { label: 'Applied', count: m.appliedTotal },
    { label: 'Interviewed', count: m.interviewed },
    { label: 'Offer', count: m.offered },
  ];
  const median =
    m.medianDaysToResponse == null ? '—' : String(Math.round(m.medianDaysToResponse * 10) / 10);
  // Screening shows as one compact fit line, not a row of pills (#115 design rules).
  const fit = [
    ...VERDICTS.map((v) => `${f.byVerdict[v.value]} ${v.label.toLowerCase()}`),
    ...(f.medianApplicants == null ? [] : [`median ${f.medianApplicants} applicants`]),
  ].join(' · ');

  return (
    <Disclosure
      label="Insights"
      variant="panel"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        try {
          localStorage.setItem(OPEN_KEY, o ? '1' : '0');
        } catch {
          /* storage blocked: kept for this visit only */
        }
      }}
    >
      <Stack gap="normal">
        {/* MetricTiles fixes min(n, 4) columns at every width, so four tiles squeeze into 80px
            columns on a phone. An auto-fit Grid of the same MetricTile wraps to 2 × 2 there and
            stays one row at desktop (HDS gap, filed with the Phase 7 asks, #133). */}
        <Grid layout="auto-fit" minItemWidth="9rem" gap="tight" align="stretch">
          <MetricTile
            label="Applied, last 7 days"
            value={m.appliedLast7}
            sub={vsWeekBefore(m.appliedLast7, m.appliedPrev7)}
          />
          <MetricTile
            label="Response rate"
            value={pct(m.responseRate)}
            sub={
              m.appliedTotal ? `${m.responded} of ${m.appliedTotal} replied` : 'Nothing applied yet'
            }
          />
          <MetricTile
            label="Interview rate"
            value={pct(m.interviewRate)}
            sub={m.appliedTotal ? `${m.interviewed} of ${m.appliedTotal} interviewed` : undefined}
          />
          <MetricTile
            label="Median reply"
            value={median}
            sub={m.medianDaysToResponse == null ? 'No replies yet' : 'days to first reply'}
          />
        </Grid>
        <section aria-labelledby="insights-funnel">
          <Stack gap="tight">
            <Text variant="ui" as="h3" id="insights-funnel" style={{ margin: 0, fontWeight: 600 }}>
              Funnel
            </Text>
            {stages.map((s) => (
              <Stack key={s.label} gap="px4">
                <Stack direction="row" justify="space-between" align="center">
                  <Text variant="ui" as="span">
                    {s.label}
                  </Text>
                  <Text variant="caption" as="span" style={SECONDARY}>
                    {s.count}
                  </Text>
                </Stack>
                <Progress
                  size="sm"
                  value={s.count}
                  max={Math.max(total, 1)}
                  label={`${s.label}: ${s.count} of ${total}`}
                />
              </Stack>
            ))}
            <Text variant="caption" as="p" style={{ ...SECONDARY, margin: 0 }}>
              Fit: {fit}
            </Text>
          </Stack>
        </section>
      </Stack>
    </Disclosure>
  );
}
