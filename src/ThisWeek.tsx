import { Badge, Cluster, Disclosure, InlineLink, Stack, Text } from '@hirobius/design-system';
import { weekAgenda, type AgendaItem } from './jobEvents';
import { useJobs } from './store';

const KIND_WORD: Record<AgendaItem['kind'], string> = {
  interview: 'Interview',
  call: 'Call',
  other: 'Event',
  followup: 'Follow up',
};

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
  const items = weekAgenda(jobs, new Date());
  if (items.length === 0) return null;

  const days: { date: string; items: AgendaItem[] }[] = [];
  for (const it of items) {
    const last = days[days.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else days.push({ date: it.date, items: [it] });
  }

  return (
    <div style={{ marginBottom: 'var(--primitive-space-4)' }}>
      <Disclosure label={`This week · ${items.length}`} defaultOpen>
        <Stack gap="normal">
          {days.map((day) => (
            <Stack key={day.date} gap="tight">
              <Text variant="ui" as="h3" style={{ margin: 0 }}>
                {dayLabel(day.date)}
              </Text>
              <Stack gap="tight" as="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {day.items.map((it, i) => (
                  <li key={`${it.jobUrl}-${it.kind}-${it.time ?? ''}-${i}`}>
                    <Cluster gap="tight" align="center">
                      <Text
                        variant="ui"
                        as="span"
                        style={{ color: 'var(--semantic-color-content-secondary)' }}
                      >
                        {it.time ?? 'All day'}
                      </Text>
                      <Text variant="ui" as="span">
                        {KIND_WORD[it.kind]}
                      </Text>
                      {it.overdue && <Badge tone="warning">Overdue</Badge>}
                      <InlineLink href={it.jobUrl}>{it.label}</InlineLink>
                      {it.company && (
                        <Text
                          variant="ui"
                          as="span"
                          style={{ color: 'var(--semantic-color-content-secondary)' }}
                        >
                          {it.company}
                        </Text>
                      )}
                    </Cluster>
                  </li>
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Disclosure>
    </div>
  );
}
