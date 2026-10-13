import { useState } from 'react';
import { Badge, Button, Disclosure, InlineLink, Stack, Text } from '@hirobius/design-system';
import { weekAgenda, type AgendaItem } from './jobEvents';
import { prettyTitle, useJobs } from './store';
import { jobHref } from './jobRoute';
import { nextUpItems } from './trackerCounts';

const KIND_WORD: Record<AgendaItem['kind'], string> = {
  interview: 'Interview',
  call: 'Call',
  other: 'Event',
  followup: 'Follow up',
};

const muted = { color: 'var(--semantic-color-content-secondary)' } as const;
const oneLine = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;

const dayLabel = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

/** Interviews, calls and follow-ups for the current Mon–Sun week. Hidden when empty. */
export default function ThisWeek() {
  const jobs = useJobs();
  const all = weekAgenda(jobs, new Date());
  const [showAll, setShowAll] = useState(false);
  if (all.length === 0) return null;
  // Cap the rail at five entries; the rest are one click away.
  const CAP = 5;
  const items = showAll ? all : all.slice(0, CAP);

  const days: { date: string; items: AgendaItem[] }[] = [];
  for (const it of items) {
    const last = days[days.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else days.push({ date: it.date, items: [it] });
  }

  return (
    <div>
      <Disclosure variant="nav" label={`This week · ${all.length}`} defaultOpen>
        <Stack gap="normal">
          {days.map((day) => (
            <Stack key={day.date} gap="tight">
              <Text variant="ui" as="h3" style={{ margin: 0 }}>
                {dayLabel(day.date)}
              </Text>
              <Stack gap="tight" as="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {day.items.map((it, i) => (
                  <li
                    key={`${it.jobUrl}-${it.kind}-${it.time ?? ''}-${i}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '52px minmax(0, 1fr) auto',
                      columnGap: 'var(--primitive-space-3)',
                      alignItems: 'baseline',
                    }}
                  >
                    {/* time · title over (kind · company) · overdue chip */}
                    <Text variant="caption" as="span" style={muted}>
                      {it.time ?? 'All day'}
                    </Text>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', ...oneLine }}>
                        <InlineLink href={it.jobUrl}>{it.label}</InlineLink>
                      </span>
                      <Text
                        variant="caption"
                        as="span"
                        style={{ display: 'block', ...muted, ...oneLine }}
                      >
                        <span>{KIND_WORD[it.kind]}</span>
                        {it.company && (
                          <>
                            {' · '}
                            <span>{it.company}</span>
                          </>
                        )}
                      </Text>
                    </span>
                    {it.overdue ? <Badge tone="warning">Overdue</Badge> : <span />}
                  </li>
                ))}
              </Stack>
            </Stack>
          ))}
          {all.length > CAP && (
            <div>
              <Button variant="tertiary" size="sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${all.length}`}
              </Button>
            </div>
          )}
        </Stack>
      </Disclosure>
    </div>
  );
}

/** "Next up": up to three due or upcoming follow-ups, each a shortcut to the job page. */
export function NextUp() {
  const jobs = useJobs();
  const items = nextUpItems(jobs);
  if (items.length === 0) return null;
  return (
    <section aria-label="Next up">
      <Disclosure variant="nav" label="Next up" defaultOpen>
        <Stack gap="tight" as="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map(({ job, due, daysUntil }) => (
            <li
              key={job.url}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                columnGap: 'var(--primitive-space-3)',
                alignItems: 'baseline',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', ...oneLine }}>
                  <InlineLink href={jobHref(job.url)}>
                    {job.label || prettyTitle(job.url)}
                  </InlineLink>
                </span>
                <Text
                  variant="caption"
                  as="span"
                  style={{ display: 'block', ...muted, ...oneLine }}
                >
                  Follow up{job.company ? ` \u2014 ${job.company}` : ''}
                </Text>
              </span>
              {due ? (
                <Badge tone="warning">Overdue</Badge>
              ) : (
                <Text variant="caption" as="span" style={muted}>
                  In {daysUntil}d
                </Text>
              )}
            </li>
          ))}
        </Stack>
      </Disclosure>
    </section>
  );
}
