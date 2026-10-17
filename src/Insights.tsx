// The Pipeline's Insights band (#128; moved off Today): the pipeline's headline numbers as metric tiles (with a trend line)
// and a funnel as Progress rows (how many jobs reached each Status), in one Disclosure whose open state is kept per device.
// Composes the existing pure read models (metrics.ts, funnel.ts); weekly bars wait for an HDS chart
// primitive (#133).
import { useState } from 'react';
import { Disclosure, Progress, Stack, Text } from '@hirobius/design-system';
import { MetricTile } from '@hirobius/design-system/patterns';
import MetricTilesAutoFit from './hds-gaps/MetricTilesAutoFit';
import { pipelineMetrics, RECENT_DAYS, vsPrevious } from './metrics';
import { computeFunnel } from './funnel';
import { VERDICTS } from './screening';
import type { Job } from './types';
import { SECONDARY } from './hds-gaps/tone';

const OPEN_KEY = 'rjb_ui_insights_open';
const pct = (r: number | null) => (r == null ? '—' : `${Math.round(r * 100)}%`);

// Closed unless this device opened it.
function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Insights({ jobs }: { jobs: Job[] }) {
  const [open, setOpen] = useState(readOpen);
  const m = pipelineMetrics(jobs, new Date());
  const f = computeFunnel(jobs);
  const total = jobs.length;
  // The funnel: all jobs, then how many reached each Status.
  const reached = [
    { label: 'All jobs', count: total },
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
      label={
        <Text variant="body" as="span" className="rjb-semibold">
          Insights
        </Text>
      }
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
        <MetricTilesAutoFit>
          <MetricTile
            label={`Applied, last ${RECENT_DAYS} days`}
            value={m.appliedLast7}
            sub={vsPrevious(m.appliedLast7, m.appliedPrev7)}
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
        </MetricTilesAutoFit>
        <section aria-labelledby="insights-funnel">
          <Stack gap="tight">
            <Text variant="ui" as="h3" id="insights-funnel" className="rjb-semibold">
              Funnel
            </Text>
            {reached.map((s) => (
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
            <Text variant="caption" as="p" style={SECONDARY}>
              Fit: {fit}
            </Text>
          </Stack>
        </section>
      </Stack>
    </Disclosure>
  );
}
